// iPhone 網頁 App(pwa/)自動化測試:用 Chromium 模擬 iPhone(螢幕、觸控、User-Agent)
// 真正的 iPhone Safari 行為(加入主畫面、選檔視窗、Google 登入)仍需實機測試,見 docs/verification/
// 用法:npm run test:pwa   結果:tests/output/pwa-results.md,截圖:tests/output/pwa-*.png
import { chromium, devices } from 'playwright';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'tests', 'output');
mkdirSync(OUTPUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// ---------- 本機網站:把專案資料夾當成 GitHub Pages ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };
const server = http.createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/pwa/`;

const results = [];
async function check(group, name, fn) {
  try {
    results.push({ group, name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ group, name, ok: false, detail: e.message.split('\n')[0] });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await chromium.launch();
const IPHONE = devices['iPhone 13'];
const errors = [];
async function phone(opts = {}) {
  const ctx = await browser.newContext({ ...IPHONE, serviceWorkers: 'block', ...opts });
  ctx.on('weberror', (e) => errors.push(e.error().message));
  return ctx;
}
const ctx = await phone();

// 外部網址的假回應(Playwright 攔截)
await ctx.route('https://raw.githubusercontent.com/**', (route) => {
  const url = route.request().url();
  if (url.includes('missing')) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
  route.fulfill({ status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' }, body: '# 網路上的筆記\n\n> [!tip] 從網址開的\n> MDR-URL-OK\n' });
});
// 對方不開放跨網站讀取時,瀏覽器的 fetch 會直接失敗;Playwright 假造的回應不受這個限制,所以用「連線失敗」模擬同一種情況
await ctx.route('https://no-cors.example.com/**', (route) => route.abort('failed'));

async function home(context = ctx) {
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#recent-empty, #recent li');
  await sleep(300);
  return page;
}
async function pickFile(page, name) {
  await page.setInputFiles('#file-input', join(ROOT, 'test-files', name));
  await page.waitForURL(/read\.html\?doc=/, { timeout: 5000 });
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered', null, { timeout: 8000 });
  await sleep(300);
}

// ========== 1 首頁 ==========
await check('1 首頁', '四個入口、最近開過空白提示、圖示字型、觸控目標 ≥ 48px', async () => {
  const page = await home();
  const r = await page.evaluate(() => ({
    entries: [...document.querySelectorAll('.pwa-entry')].map((e) => [e.querySelector('b').textContent, Math.round(e.getBoundingClientRect().height)]),
    empty: !document.getElementById('recent-empty').hidden,
    version: document.getElementById('version').textContent,
  }));
  await page.evaluate(() => document.fonts.ready);
  // 圖示字型真的載入了(而且是從網站本身,不是插件專用網址)
  const font = await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('MDR Symbols') && f.status === 'loaded'));
  await page.screenshot({ path: join(OUTPUT, 'pwa-home.png') });
  await page.close();
  assert(r.entries.length === 4 && r.entries.every(([, h]) => h >= 48) && r.empty && font && r.version.includes(VERSION), JSON.stringify(r));
  return r.entries.map(([t, h]) => `${t} ${h}px`).join('、');
});
await check('1 首頁', 'iPhone 上還沒加到主畫面:顯示「加到主畫面」提示,關掉後不再出現', async () => {
  const page = await home();
  const shown = await page.isVisible('#install');
  await page.tap('#install-close');
  await page.reload();
  await sleep(300);
  const again = await page.isVisible('#install');
  await page.close();
  assert(shown && !again, JSON.stringify({ shown, again }));
  return '提示 → 關閉 → 重新整理後不再出現';
});
await check('1 首頁', 'manifest 與圖示正確(名稱、獨立視窗、192/512/可裁切圖示、iPhone 圖示)', async () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'pwa', 'manifest.webmanifest'), 'utf8'));
  const icons = m.icons.map((i) => existsSync(join(ROOT, 'pwa', i.src)));
  const apple = existsSync(join(ROOT, 'pwa', 'icons', 'apple-touch-icon.png'));
  assert(m.name === 'MD隨手讀' && m.display === 'standalone' && m.start_url === './' && icons.every(Boolean) && m.icons.some((i) => i.purpose === 'maskable') && apple, JSON.stringify({ icons, apple }));
  return `${m.icons.length} 個圖示 + iPhone 主畫面圖示`;
});

// ========== 2 開啟 ==========
await check('2 開啟', '選擇檔案 → 排版(Obsidian 提示框、屬性表)→ 回首頁出現在最近開過', async () => {
  const page = await home();
  await pickFile(page, 'obsidian-note.md');
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    // 收合箭頭用 ::before 顯示圖示名稱:字型有載入時,它的寬度應該跟一個圖示差不多,而不是一整串英文字
    const arrow = document.querySelector('.mdr-props > summary');
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;font:20px "MDR Symbols";white-space:nowrap';
    probe.textContent = 'chevron_right';
    document.body.append(probe);
    const glyph = probe.getBoundingClientRect().width;
    probe.remove();
    return { callouts: document.querySelectorAll('.callout').length, props: !!arrow, back: !!document.querySelector('.pwa-back'), glyph };
  });
  await page.screenshot({ path: join(OUTPUT, 'pwa-read.png') });
  await page.tap('.pwa-back');
  await page.waitForSelector('#recent li');
  const recent = await page.$$eval('#recent li', (li) => li.map((l) => l.textContent));
  await page.close();
  assert(r.callouts > 0 && r.props && r.back && r.glyph < 40 && recent[0].includes('obsidian-note.md'), JSON.stringify({ r, recent }));
  return `提示框 ${r.callouts} 個、屬性表、返回鍵;最近開過:${recent.length} 筆`;
});
await check('2 開啟', '選到不是文字的檔(圖片):提示錯誤、留在首頁', async () => {
  const page = await home();
  const img = readFileSync(join(ROOT, 'pwa', 'icons', 'icon-192.png'));
  await page.setInputFiles('#file-input', { name: 'photo.png', mimeType: 'image/png', buffer: img });
  await sleep(500);
  const toast = await page.textContent('.pwa-toast');
  const url = page.url();
  await page.close();
  assert(toast.includes('不是文字檔') && !url.includes('read.html'), toast);
  return toast;
});
await check('2 開啟', '貼上文字 → 排版;名稱取第一個標題', async () => {
  const page = await home();
  await page.tap('#paste-btn');
  await sleep(400);
  await page.fill('#paste-text', '# 貼上的筆記\n\n==螢光筆== 與 #標籤\n');
  await page.tap('#paste-go');
  await page.waitForURL(/read\.html/);
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered');
  const r = await page.evaluate(() => ({ title: document.title, mark: !!document.querySelector('mark'), tag: !!document.querySelector('.mdr-tag') }));
  await page.close();
  assert(r.title === '貼上的筆記' && r.mark && r.tag, JSON.stringify(r));
  return `標題「${r.title}」、螢光筆、標籤`;
});
await check('2 開啟', '輸入 GitHub 檔案頁網址 → 自動換成原始檔並排版', async () => {
  const page = await home();
  await page.tap('#url-btn');
  await sleep(400);
  await page.fill('#url-input', 'https://github.com/someone/notes/blob/main/README.md');
  await page.tap('#url-go');
  await page.waitForURL(/read\.html/);
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered');
  const ok = await page.evaluate(() => document.body.innerText.includes('MDR-URL-OK'));
  await page.close();
  assert(ok, '內容不對');
  return 'github.com/…/blob/… → raw.githubusercontent.com';
});
await check('2 開啟', '網址讀不到(404、對方不開放讀取):說明原因,不離開首頁', async () => {
  const page = await home();
  const tryUrl = async (u) => {
    await page.tap('#url-btn');
    await sleep(400);
    await page.fill('#url-input', u);
    await page.tap('#url-go');
    await page.waitForFunction(() => document.querySelector('.pwa-toast.is-show.is-error'), null, { timeout: 5000 });
    const t = await page.textContent('.pwa-toast');
    await page.evaluate(() => document.querySelector('.pwa-toast').classList.remove('is-show'));
    await page.keyboard.press('Escape');
    await sleep(400);
    return t;
  };
  const a = await tryUrl('https://raw.githubusercontent.com/x/y/main/missing.md');
  const b = await tryUrl('https://no-cors.example.com/a.md');
  const url = page.url();
  await page.close();
  assert(a.includes('404') && b.includes('沒有開放讀取') && !url.includes('read.html'), JSON.stringify({ a, b }));
  return `404:${a.slice(0, 16)}…/ 不開放:${b.slice(0, 18)}…`;
});
await check('2 開啟', '惡意範例檔:程式碼不會被執行', async () => {
  const page = await home();
  await pickFile(page, 'xss.md');
  await sleep(500);
  const r = await page.evaluate(() => ({ xss: window.__mdrXss || null, scripts: document.querySelectorAll('.mdr-body script, .mdr-body iframe').length }));
  await page.close();
  assert(!r.xss && r.scripts === 0, JSON.stringify(r));
  return '消毒器擋下所有惡意寫法';
});

// ========== 3 最近開過 ==========
await check('3 最近開過', '同一個檔再開一次不重複;重新整理後還在(存在手機);點了直接重看', async () => {
  const page = await home();
  await pickFile(page, 'sample-zh.md');
  await page.goto(BASE);
  await pickFile(page, 'sample-zh.md');
  await page.goto(BASE);
  await page.reload();
  await page.waitForSelector('#recent li');
  const names = await page.$$eval('#recent .pwa-row-text > span', (s) => s.map((x) => x.textContent));
  const dup = names.filter((n) => n === 'sample-zh.md').length;
  await page.tap('#recent li:first-child a');
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered');
  const ok = await page.evaluate(() => document.body.innerText.includes('MDR-ZH-OK-繁中正常'));
  await page.close();
  assert(dup === 1 && ok, JSON.stringify({ names, ok }));
  return `${names.length} 筆,不重複;重看正常`;
});
await check('3 最近開過', '設定 → 清除最近開過', async () => {
  const page = await home();
  page.on('dialog', (d) => d.accept());
  await page.tap('#settings-btn');
  await sleep(400);
  await page.tap('#clear-btn');
  await sleep(500);
  const r = await page.evaluate(() => ({ n: document.querySelectorAll('#recent li').length, empty: !document.getElementById('recent-empty').hidden }));
  await page.close();
  assert(r.n === 0 && r.empty, JSON.stringify(r));
  return '清空';
});

// ========== 4 閱讀頁 ==========
await check('4 閱讀頁', '工具列齒輪 → 閱讀設定面板;字級 +2、行寬、主題即時套用並記住', async () => {
  const page = await home();
  await pickFile(page, 'sample-zh.md');
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mdr-font-size'));
  await page.tap('.mdr-toolbar [data-action="settings"]');
  await sleep(450);
  const open = await page.evaluate(() => document.getElementById('read-sheet').classList.contains('is-open'));
  await page.screenshot({ path: join(OUTPUT, 'pwa-read-sheet.png') });
  await page.tap('#rs-bigger');
  await sleep(150);
  await page.tap('#rs-bigger');
  await sleep(150);
  await page.tap('#rs-width [data-value="full"]');
  await page.tap('#rs-theme [data-value="dark"]');
  await sleep(300);
  const after = await page.evaluate(() => ({ size: getComputedStyle(document.documentElement).getPropertyValue('--mdr-font-size'), width: getComputedStyle(document.documentElement).getPropertyValue('--mdr-width'), theme: document.documentElement.dataset.mdrTheme, label: document.getElementById('rs-size').textContent }));
  await page.screenshot({ path: join(OUTPUT, 'pwa-read-dark.png') });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered');
  const kept = await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--mdr-font-size'), document.documentElement.dataset.mdrTheme]);
  await page.evaluate(() => localStorage.removeItem('mdr-sync'));
  await page.close();
  assert(open && before === '16px' && after.size === '18px' && after.width === 'none' && after.theme === 'dark' && after.label === '18px' && kept[0] === '18px' && kept[1] === 'dark', JSON.stringify({ open, before, after, kept }));
  return `字級 ${before} → ${after.size}、滿版、深色;重新整理後保留`;
});
await check('4 閱讀頁', '分享這份文件:分享成 .md 檔', async () => {
  const page = await home();
  await pickFile(page, 'obsidian-note.md');
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared = { name: data.files?.[0]?.name, type: data.files?.[0]?.type, size: data.files?.[0]?.size }; };
  });
  await page.tap('.mdr-toolbar [data-action="settings"]');
  await sleep(450);
  await page.tap('#rs-share');
  await sleep(200);
  const shared = await page.evaluate(() => window.__shared);
  await page.close();
  assert(shared?.name === 'obsidian-note.md' && shared.type === 'text/markdown' && shared.size > 100, JSON.stringify(shared));
  return `${shared.name}(${shared.size} bytes)`;
});
await check('4 閱讀頁', '連到同資料夾其他筆記的連結:不跳到錯誤頁,說明原因', async () => {
  const page = await home();
  await pickFile(page, 'obsidian-note.md');
  const link = await page.$('.mdr-body a.internal-link, .mdr-body a[href$=".md"]');
  assert(link, '文件裡找不到雙中括號連結');
  await link.tap();
  await sleep(400);
  const r = await page.evaluate(() => ({ url: location.href, toast: document.querySelector('.pwa-toast')?.textContent || '' }));
  await page.close();
  assert(r.url.includes('read.html') && r.toast.includes('Obsidian'), JSON.stringify(r));
  return '留在原頁並提示可改用 Obsidian 開';
});
await check('4 閱讀頁', '文件已不在手機裡:說明原因並提供回首頁按鈕', async () => {
  const page = await ctx.newPage();
  await page.goto(`${BASE}read.html?doc=nope`);
  await page.waitForSelector('.mdr-error');
  const r = await page.evaluate(() => ({ text: document.querySelector('.mdr-error').textContent, home: !!document.querySelector('.mdr-error a[href="./"]') }));
  await page.close();
  assert(r.text.includes('不在手機裡') && r.home, JSON.stringify(r));
  return '錯誤說明 + 回首頁';
});

// ========== 5 Google Drive ==========
await check('5 Google Drive', '還沒設定 Google 登入:顯示申請步驟與替代做法', async () => {
  const page = await home();
  await page.tap('#drive-btn');
  await sleep(450);
  const t = await page.textContent('#drive-body');
  await page.close();
  assert(t.includes('還沒設定') && t.includes('PWA-GOOGLE-DRIVE.md') && t.includes('選擇檔案'), t);
  return '說明 + 替代做法';
});
await check('5 Google Drive', '登入(整頁跳轉)→ 列出 .md(篩掉其他檔)→ 點選 → 排版', async () => {
  const dctx = await phone();
  await dctx.route('**/pwa/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "globalThis.MDR_CONFIG = { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' };" }));
  let authUrl = null;
  await dctx.route('https://accounts.google.com/**', (r) => {
    authUrl = new URL(r.request().url());
    const back = `${authUrl.searchParams.get('redirect_uri')}#access_token=GOOD&expires_in=3600&token_type=Bearer&state=${authUrl.searchParams.get('state')}`;
    r.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back)})</script>` });
  });
  let auth = '';
  await dctx.route('https://www.googleapis.com/drive/v3/files**', (r) => {
    auth = r.request().headers().authorization;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (r.request().url().includes('alt=media')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/markdown' }, body: '# 雲端的筆記\n\nMDR-DRIVE-PWA-OK\n' });
    r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ files: [
      { id: 'a1', name: '週會紀錄.md', modifiedTime: new Date().toISOString() },
      { id: 'b2', name: 'notes.txt', modifiedTime: new Date().toISOString() },
      { id: 'c3', name: '讀書筆記.markdown', modifiedTime: new Date(Date.now() - 86400000 * 3).toISOString() },
    ] }) });
  });
  const page = await home(dctx);
  await page.tap('#drive-btn');
  await sleep(450);
  await page.tap('#drive-body .mdr-btn-primary');
  await page.waitForSelector('#drive-list .pwa-row', { timeout: 8000 });
  const names = await page.$$eval('#drive-list .pwa-row-text > span', (s) => s.map((x) => x.textContent));
  const cleanUrl = !page.url().includes('access_token');
  await page.screenshot({ path: join(OUTPUT, 'pwa-drive.png') });
  await page.tap('#drive-list .pwa-row');
  await page.waitForURL(/read\.html/);
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered');
  const ok = await page.evaluate(() => document.body.innerText.includes('MDR-DRIVE-PWA-OK'));
  await page.close();
  await dctx.close();
  const scope = authUrl?.searchParams.get('scope');
  assert(names.join() === '週會紀錄.md,讀書筆記.markdown' && ok && auth === 'Bearer GOOD' && cleanUrl && scope.endsWith('drive.readonly') && authUrl.searchParams.get('response_type') === 'token', JSON.stringify({ names, ok, auth, cleanUrl, scope }));
  return `只要讀取權限;列出 ${names.length} 個 .md;登入憑證沒留在網址上`;
});
await check('5 Google Drive', '登入過期(401):回到登入畫面', async () => {
  const dctx = await phone();
  await dctx.route('**/pwa/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "globalThis.MDR_CONFIG = { GOOGLE_CLIENT_ID: 'x' };" }));
  await dctx.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: r.request().method() === 'OPTIONS' ? 204 : 401, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' } }));
  const page = await home(dctx);
  await page.evaluate(() => localStorage.setItem('mdr-drive-token', JSON.stringify({ token: 'OLD', exp: Date.now() + 3600e3 })));
  await page.tap('#drive-btn');
  await page.waitForFunction(() => document.querySelector('#drive-body')?.textContent.includes('用 Google 帳號登入'), null, { timeout: 5000 });
  const token = await page.evaluate(() => localStorage.getItem('mdr-drive-token'));
  await page.close();
  await dctx.close();
  assert(!token, '過期的登入憑證沒有清掉');
  return '清掉舊憑證、顯示登入按鈕';
});

// ========== 6 離線 ==========
await check('6 離線', '開過一次後關掉網路:首頁、閱讀頁、最近開過都能用', async () => {
  const octx = await phone({ serviceWorkers: 'allow' });
  const page = await octx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await pickFile(page, 'sample-zh.md');
  await octx.setOffline(true);
  await page.goto(BASE);
  await page.waitForSelector('#recent li');
  await page.tap('#recent li:first-child a');
  await page.waitForFunction(() => document.documentElement.dataset.mdr === 'rendered', null, { timeout: 8000 });
  const r = await page.evaluate(() => ({ zh: document.body.innerText.includes('MDR-ZH-OK-繁中正常'), font: [...document.fonts].some((f) => f.family.includes('MDR Symbols') && f.status === 'loaded') }));
  await page.close();
  await octx.close();
  assert(r.zh && r.font, JSON.stringify(r));
  return '沒網路也能打開最近開過的文件';
});
await check('6 離線', '離線快取清單涵蓋頁面用到的所有檔,版本號一致', async () => {
  const sw = readFileSync(join(ROOT, 'pwa', 'sw.js'), 'utf8');
  const shell = [...sw.matchAll(/(?:'|`)(?:\$\{E\})?([^'`]+)(?:'|`)/g)].map((m) => (m[0].includes('${E}') ? `../extension/${m[1]}` : m[1]));
  const want = [];
  for (const page of ['index.html', 'read.html']) {
    const html = readFileSync(join(ROOT, 'pwa', page), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) if (!m[1].startsWith('./') && m[1] !== './') want.push(m[1]);
  }
  const missing = [...new Set(want)].filter((f) => !shell.includes(f));
  const notFound = shell.filter((f) => f.includes('.') && !/^\d+\.\d+\.\d+$/.test(f) && !existsSync(join(ROOT, 'pwa', f)));
  const swVer = sw.match(/VERSION = '([^']+)'/)[1];
  const platVer = readFileSync(join(ROOT, 'pwa', 'platform.js'), 'utf8').match(/VERSION = '([^']+)'/)[1];
  assert(!missing.length && !notFound.length && swVer === VERSION && platVer === VERSION, JSON.stringify({ missing, notFound, swVer, platVer, VERSION }));
  return `${shell.length} 個檔;版本 ${VERSION}`;
});

// ========== 7 觸控 ==========
await check('7 觸控', '底部面板:往下拖把手關閉;點背景關閉', async () => {
  const page = await home();
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await page.tap('#paste-btn');
  await sleep(450);
  const h = await page.$eval('#paste-sheet .pwa-sheet-handle', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 2 }; });
  await touch('touchStart', h.x, h.y);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', h.x, h.y + i * 25); await sleep(16); }
  await sleep(60);
  await touch('touchEnd');
  await sleep(450);
  const closed = await page.evaluate(() => !document.getElementById('paste-sheet').classList.contains('is-open'));
  await page.tap('#url-btn');
  await sleep(450);
  await page.mouse.click(200, 60); // 點上方的背景
  await sleep(450);
  const closed2 = await page.evaluate(() => !document.getElementById('url-sheet').classList.contains('is-open'));
  await page.close();
  assert(closed && closed2, JSON.stringify({ closed, closed2 }));
  return '拖把手關閉、點背景關閉';
});

// ---------- 收尾 ----------
await check('8 整體', '全程沒有程式錯誤', async () => {
  assert(!errors.length, errors.join(' | '));
  return '0 個錯誤';
});
await browser.close();
server.close();
const lines = [`# 手機版自動化測試結果(v${VERSION})`, '', `- 時間:${new Date().toLocaleString('zh-TW')}`, `- 模擬裝置:iPhone 13(Chromium)`, '', '| 分類 | 項目 | 結果 | 說明 |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '\\|')} |`)];
writeFileSync(join(OUTPUT, 'pwa-results.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
