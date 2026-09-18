// 自動化測試:用 Chrome for Testing 載入插件,跑完整流程並列出結果
// 用法:npm test    (Google Drive 需登入、系統通知需真人看,改由人工驗收)
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const TMP = join(ROOT, 'tests', '.tmp');
const PROFILE = join(TMP, 'profile');
const DOWNLOADS = join(TMP, 'downloads');
const OUTPUT = join(ROOT, 'tests', 'output');
const VERSION = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')).version;
const SAMPLE = readFileSync(join(ROOT, 'test-files', 'sample-zh.md'));
const XSS = readFileSync(join(ROOT, 'test-files', 'xss.md'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (name) => pathToFileURL(join(ROOT, 'test-files', name)).href;

// ---------- 測試用網站:模擬各種伺服器行為 ----------
const ROUTES = {
  '/plain/test.md': { type: 'text/plain; charset=utf-8' },
  '/nocharset/test.md': { type: 'text/plain' },
  '/markdown/test.md': { type: 'text/markdown; charset=utf-8' },
  '/attach/test.md': { type: 'application/octet-stream', extra: { 'content-disposition': 'attachment; filename="test.md"' } },
  '/csp/test.md': { type: 'text/plain; charset=utf-8', extra: { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } },
  '/html/README.md': { type: 'text/html; charset=utf-8', body: Buffer.from('<!doctype html><title>GitHub-like</title><h1 id="gh">本來就是網頁</h1>') },
  '/download': { type: 'application/octet-stream', extra: { 'content-disposition': "attachment; filename*=UTF-8''%E4%B8%8B%E8%BC%89%E6%B8%AC%E8%A9%A6.md" } },
  '/xss.md': { type: 'text/plain; charset=utf-8', body: XSS },
};
const server = http.createServer((req, res) => {
  const route = ROUTES[new URL(req.url, 'http://x').pathname];
  if (!route) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': route.type, ...route.extra }).end(route.body || SAMPLE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- 啟動載入插件的 Chrome for Testing ----------
rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(PROFILE, 'Default'), { recursive: true });
mkdirSync(DOWNLOADS, { recursive: true });
mkdirSync(OUTPUT, { recursive: true });
writeFileSync(join(PROFILE, 'Default', 'Preferences'), JSON.stringify({
  download: { default_directory: DOWNLOADS, prompt_for_download: false, directory_upgrade: true },
}));
const chrome = spawn(chromium.executablePath(), [
  `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
  '--remote-debugging-port=0', '--headless', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const portFile = join(PROFILE, 'DevToolsActivePort');
for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
const port = readFileSync(portFile, 'utf8').split('\n')[0];
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const context = browser.contexts()[0];

// Chrome 內建的元件擴充也有背景程式(連檔名都叫 background.js),用插件名稱挑出我們的
async function findOurWorker() {
  for (let i = 0; i < 75; i++) {
    for (const w of context.serviceWorkers()) {
      const name = await w.evaluate(() => chrome.runtime.getManifest().name).catch(() => null);
      if (name === 'MD隨手讀') return w;
    }
    await sleep(200);
  }
  throw new Error('找不到 MD隨手讀 的背景程式,插件可能載入失敗');
}
const sw = await findOurWorker();
const EXT_ID = new URL(sw.url()).host;
const OPTIONS_URL = `chrome-extension://${EXT_ID}/pages/options.html`;
const setSettings = (patch) => sw.evaluate((p) => chrome.storage.sync.set(p), patch);
const resetSettings = () => sw.evaluate(() => chrome.storage.sync.clear());

// Playwright 會把下載檔改成亂碼檔名,改回 Chrome 的正常行為(保留原檔名)
const cdp = await browser.newBrowserCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });

// ---------- 小工具 ----------
const results = [];
async function check(group, name, fn) {
  try {
    const detail = await fn();
    results.push({ group, name, ok: true, detail });
  } catch (e) {
    results.push({ group, name, ok: false, detail: e.message.split('\n')[0] });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function open(url, width = 1300) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return page;
}

async function inspect(url, shot) {
  const page = await open(url);
  try {
    if (shot) await page.screenshot({ path: join(OUTPUT, shot) });
    return await page.evaluate(() => ({
      mdr: document.documentElement.dataset.mdr || null,
      contentType: document.contentType,
      table: !!document.querySelector('.mdr-body table'),
      code: !!document.querySelector('.mdr-body pre code'),
      zhOk: document.body.innerText.includes('MDR-ZH-OK-繁中正常'),
      cssApplied: getComputedStyle(document.querySelector('.mdr-page') || document.body).maxWidth === '760px',
      xss: window.__mdrXss || null,
      dangerous: document.querySelectorAll('.mdr-body script, .mdr-body iframe, .mdr-body [onerror], .mdr-body [onload], .mdr-body a[href^="javascript:"]').length,
    }));
  } finally {
    await page.close();
  }
}
function expectRendered(r) {
  assert(r.mdr === 'rendered', `沒有排版(mdr=${r.mdr}, contentType=${r.contentType})`);
  assert(r.zhOk, '中文驗證碼不見了或變亂碼');
  assert(r.table && r.code, '表格或程式碼沒有排出來');
  assert(r.cssApplied, '樣式沒有套上');
  return `contentType=${r.contentType}`;
}

// 等某個條件成立(每 200ms 看一次)
async function waitFor(fn, ms = 5000) {
  for (let t = 0; t < ms; t += 200) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return null;
}
const notifications = () => sw.evaluate(() => chrome.notifications.getAll()).then(Object.keys);
async function clearNotifications() {
  for (const id of await notifications()) await sw.evaluate((n) => chrome.notifications.clear(n), id);
}
async function triggerDownload() {
  await sw.evaluate((url) => chrome.downloads.download({ url, conflictAction: 'uniquify' }), `${BASE}/download?id=${Date.now()}`);
}

// ========== 1 本機檔 ==========
const fileAccess = await sw.evaluate(() => chrome.extension.isAllowedFileSchemeAccess());
await check('1 本機檔', '插件有檔案存取權限(指令列載入的未封裝插件)', async () => `isAllowedFileSchemeAccess=${fileAccess}`);
await check('1 本機檔', 'file:// 中文 .md 就地排版', async () => expectRendered(await inspect(fileUrl('sample-zh.md'), 'render-light.png')));
await check('1 本機檔', '檔名含空格與中文', async () => expectRendered(await inspect(fileUrl('測試 中文檔名.md'))));
await check('1 本機檔', '閱讀頁用 XHR 讀本機檔(Windows 後援路線)', async () =>
  expectRendered(await inspect(`chrome-extension://${EXT_ID}/pages/viewer.html?src=${encodeURIComponent(fileUrl('sample-zh.md'))}`)));
await check('1 本機檔', '惡意範例檔:程式碼全部被擋', async () => {
  const r = await inspect(fileUrl('xss.md'));
  assert(r.mdr === 'rendered', '沒有排版');
  assert(!r.xss, `惡意程式碼被執行了:${r.xss}`);
  assert(r.dangerous === 0, `排版結果仍含 ${r.dangerous} 個危險元素`);
  return '無執行、無殘留危險元素';
});

// ========== 4 網路檔 ==========
await check('4 網路檔', '一般 text/plain', async () => expectRendered(await inspect(`${BASE}/plain/test.md`)));
await check('4 網路檔', '沒宣告編碼的 text/plain(中文不亂碼)', async () => expectRendered(await inspect(`${BASE}/nocharset/test.md`)));
await check('4 網路檔', 'text/markdown', async () => expectRendered(await inspect(`${BASE}/markdown/test.md`)));
await check('4 網路檔', '伺服器強制下載 + octet-stream → 直接顯示', async () => expectRendered(await inspect(`${BASE}/attach/test.md`)));
await check('4 網路檔', '嚴格 CSP + sandbox(模擬 GitHub raw)', async () => expectRendered(await inspect(`${BASE}/csp/test.md`)));
await check('4 網路檔', '本來就是網頁的 .md 網址不被動到', async () => {
  const page = await open(`${BASE}/html/README.md`);
  const r = await page.evaluate(() => ({ mdr: document.documentElement.dataset.mdr || null, type: document.contentType, gh: !!document.getElementById('gh') }));
  await page.close();
  assert(r.mdr === null && r.type === 'text/html' && r.gh, `被誤排版了(mdr=${r.mdr})`);
  return '維持原網頁';
});
await check('4 網路檔', '網路上的惡意範例檔', async () => {
  const r = await inspect(`${BASE}/xss.md`);
  assert(r.mdr === 'rendered' && !r.xss && r.dangerous === 0, `xss=${r.xss}, dangerous=${r.dangerous}`);
  return '無執行、無殘留危險元素';
});

// ========== 5 閱讀畫面(v0.2)==========
await check('5 閱讀畫面', '待辦勾選框', async () => {
  const page = await open(fileUrl('tasks-lists.md'));
  const r = await page.evaluate(() => ({
    boxes: document.querySelectorAll('.mdr-body li.mdr-task > input[type=checkbox]').length,
    checked: document.querySelectorAll('.mdr-body li.mdr-task > input:checked').length,
    leftover: document.querySelector('.mdr-body').innerText.includes('[ ]'),
  }));
  await page.close();
  assert(r.boxes === 5 && r.checked === 2 && !r.leftover, JSON.stringify(r));
  return '5 個勾選框,2 個已勾';
});
await check('5 閱讀畫面', '程式碼上色', async () => {
  const page = await open(fileUrl('code-langs.md'));
  await page.screenshot({ path: join(OUTPUT, 'render-code.png') });
  const colored = await page.evaluate(() => [...document.querySelectorAll('.mdr-body pre code')].filter((c) => c.querySelector('[class^="hljs-"]')).length);
  await page.close();
  assert(colored >= 7, `只有 ${colored} 個程式碼區塊有上色`);
  return `${colored} 個區塊上色`;
});
await check('5 閱讀畫面', '目錄:列出標題、點了跳轉、標出目前段落', async () => {
  const page = await open(fileUrl('toc-long.md'));
  const before = await page.evaluate(() => ({ state: document.querySelector('.mdr-shell').dataset.toc, links: document.querySelectorAll('.mdr-toc a').length }));
  assert(before.state === 'open' && before.links === 20, `目錄狀態 ${before.state}、${before.links} 項`);
  await page.click('.mdr-toc a[data-target="第-3-章-章節標題"]');
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    top: Math.round(document.getElementById('第-3-章-章節標題').getBoundingClientRect().top),
    active: document.querySelector('.mdr-toc a.is-active')?.dataset.target,
  }));
  await page.screenshot({ path: join(OUTPUT, 'render-toc.png') });
  await page.close();
  assert(after.top >= 0 && after.top < 90 && after.active === '第-3-章-章節標題', JSON.stringify(after));
  return `20 項;跳轉後標題在頂端 ${after.top}px`;
});
await check('5 閱讀畫面', '窄螢幕:目錄預設收起,按 ☰ 才打開', async () => {
  const page = await open(fileUrl('toc-long.md'), 800);
  const closed = await page.evaluate(() => document.querySelector('.mdr-shell').dataset.toc);
  await page.click('.mdr-toolbar [data-action="toc"]');
  const opened = await page.evaluate(() => document.querySelector('.mdr-shell').dataset.toc);
  const saved = await sw.evaluate(() => chrome.storage.sync.get('toc'));
  await page.close();
  assert(closed === 'closed' && opened === 'open' && saved.toc === undefined, `${closed} → ${opened},設定被改成 ${saved.toc}`);
  return '收起 → 打開(不影響寬螢幕的設定)';
});
await check('5 閱讀畫面', '文件內 #連結 跳轉', async () => {
  const page = await open(fileUrl('toc-long.md'));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click('.mdr-body a[href*="%E7%AC%AC-3"], .mdr-body a[href*="第-3"]');
  await page.waitForTimeout(600);
  const top = await page.evaluate(() => Math.round(document.getElementById('第-3-章-章節標題').getBoundingClientRect().top));
  await page.close();
  assert(Math.abs(top) < 90, `跳轉後標題位置 ${top}px`);
  return `標題位置 ${top}px`;
});
await check('5 閱讀畫面', '相對路徑圖片', async () => {
  const page = await open(fileUrl('images.md'));
  const w = await page.evaluate(() => document.querySelector('.mdr-body img[src*="sample.png"]')?.naturalWidth || 0);
  await page.close();
  assert(w > 0, '圖片沒有載入');
  return `圖片寬 ${w}px`;
});
await check('5 閱讀畫面', '原始碼切換', async () => {
  const page = await open(fileUrl('sample-zh.md'));
  await page.click('.mdr-toolbar [data-action="raw"]');
  const on = await page.evaluate(() => ({ raw: !document.querySelector('.mdr-raw').hidden, article: !document.querySelector('.mdr-body').hidden, text: document.querySelector('.mdr-raw').textContent.startsWith('# 繁體中文測試文件') }));
  await page.click('.mdr-toolbar [data-action="raw"]');
  const off = await page.evaluate(() => !document.querySelector('.mdr-raw').hidden);
  await page.close();
  assert(on.raw && !on.article && on.text && !off, JSON.stringify({ on, off }));
  return '排版 ⇄ 原始碼';
});
await check('5 閱讀畫面', '主題按鈕:跟隨系統 → 淺色 → 深色,並記住', async () => {
  const page = await open(fileUrl('sample-zh.md'));
  const seen = [await page.evaluate(() => document.documentElement.dataset.mdrTheme)];
  for (let i = 0; i < 2; i++) {
    await page.click('.mdr-toolbar [data-action="theme"]');
    await page.waitForTimeout(250);
    seen.push(await page.evaluate(() => document.documentElement.dataset.mdrTheme));
  }
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.screenshot({ path: join(OUTPUT, 'render-dark.png') });
  const saved = (await sw.evaluate(() => chrome.storage.sync.get('theme'))).theme;
  await page.close();
  await resetSettings();
  assert(seen.join('→') === 'system→light→dark' && bg === 'rgb(30, 30, 30)' && saved === 'dark', `${seen.join('→')}、背景 ${bg}、存成 ${saved}`);
  return `${seen.join(' → ')},深色背景 ${bg}`;
});
await check('5 閱讀畫面', '⚙️ 按鈕打開設定頁', async () => {
  const page = await open(fileUrl('sample-zh.md'));
  const opened = context.waitForEvent('page', { timeout: 5000 });
  await page.click('.mdr-toolbar [data-action="settings"]');
  const opt = await opened;
  await opt.waitForLoadState('load');
  const url = opt.url();
  await opt.close();
  await page.close();
  assert(url.startsWith(OPTIONS_URL), `開到了 ${url}`);
  return 'options.html';
});

// ========== 6 設定頁與更新日誌(v0.2)==========
await check('6 設定頁', '更新日誌內容與 docs 版本一致', async () => {
  const a = readFileSync(join(ROOT, 'docs', 'changelog', 'CHANGELOG.md'), 'utf8');
  const b = readFileSync(join(EXT, 'CHANGELOG.md'), 'utf8');
  assert(a === b, 'extension/CHANGELOG.md 過期了,請跑 npm run sync');
  assert(a.includes(`## v${VERSION}`), `CHANGELOG 沒有 v${VERSION} 的條目`);
  return `含 v${VERSION}`;
});
await check('6 設定頁', '設定頁顯示版本號', async () => {
  const page = await open(OPTIONS_URL, 1200);
  await page.screenshot({ path: join(OUTPUT, 'options-appearance.png') });
  const v = await page.textContent('#version');
  await page.close();
  assert(v === `v${VERSION}`, `顯示 ${v}`);
  return v;
});
await check('6 設定頁', '更新日誌分頁:排版顯示,目前版本有標記', async () => {
  const page = await open(`${OPTIONS_URL}#changelog`, 1200);
  await page.waitForSelector('#changelog h2');
  await page.screenshot({ path: join(OUTPUT, 'options-changelog.png') });
  const r = await page.evaluate(() => ({
    versions: [...document.querySelectorAll('#changelog h2')].map((h) => h.textContent.match(/v\d+\.\d+\.\d+/)?.[0]),
    badge: document.querySelector('#changelog h2 .opt-badge')?.parentElement.textContent,
  }));
  await page.close();
  assert(r.versions.length >= 2 && r.badge?.includes(`v${VERSION}`), JSON.stringify(r));
  return `${r.versions.join('、')}(${VERSION} 標記為目前版本)`;
});
await check('6 設定頁', '在設定頁切深色 → 已開著的閱讀分頁立刻變深色', async () => {
  const reader = await open(fileUrl('sample-zh.md'));
  const opt = await open(OPTIONS_URL, 1200);
  await opt.click('.opt-seg[data-key="theme"] button[data-value="dark"]');
  await sleep(500);
  const r = await reader.evaluate(() => ({ theme: document.documentElement.dataset.mdrTheme, bg: getComputedStyle(document.body).backgroundColor }));
  const pressed = await opt.getAttribute('.opt-seg[data-key="theme"] button[data-value="dark"]', 'aria-pressed');
  await opt.close();
  await reader.close();
  assert(r.theme === 'dark' && r.bg === 'rgb(30, 30, 30)' && pressed === 'true', JSON.stringify({ ...r, pressed }));
  return `閱讀分頁 → ${r.bg}`;
});
await check('6 設定頁', '字級與版面寬度套用到閱讀畫面', async () => {
  await setSettings({ fontSize: 20, width: 'wide' });
  const page = await open(fileUrl('sample-zh.md'));
  const r = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.mdr-page')); return { size: s.fontSize, width: s.maxWidth }; });
  await page.close();
  assert(r.size === '20px' && r.width === '960px', JSON.stringify(r));
  return `字級 ${r.size}、寬度 ${r.width}`;
});
await check('6 設定頁', '關閉「顯示目錄」', async () => {
  await setSettings({ toc: false });
  const page = await open(fileUrl('toc-long.md'));
  const state = await page.evaluate(() => document.querySelector('.mdr-shell').dataset.toc);
  await page.close();
  assert(state === 'closed', `目錄狀態 ${state}`);
  return '目錄收起';
});
await check('6 設定頁', '恢復預設值', async () => {
  const page = await open(OPTIONS_URL, 1200);
  page.once('dialog', (d) => d.accept());
  await page.click('#reset');
  await sleep(400);
  const s = await sw.evaluate(() => chrome.storage.sync.get(null));
  const size = await page.textContent('#fontSize-value');
  await page.close();
  assert(Object.keys(s).length === 0 && size === '16 px', `設定剩 ${JSON.stringify(s)},字級顯示 ${size}`);
  return '全部回到預設';
});
await check('6 設定頁', '檔案權限狀態', async () => {
  const page = await open(`${OPTIONS_URL}#permission`, 1200);
  await page.waitForFunction(() => document.getElementById('file-access').textContent.length > 0);
  const t = await page.textContent('#file-access');
  await page.close();
  assert(t.includes(fileAccess ? '已開啟' : '尚未開啟'), t);
  return t;
});

// ========== 2 下載(三種模式)==========
await check('2 下載', '預設「跳通知」:下載 .md 後出現通知', async () => {
  await resetSettings();
  await clearNotifications();
  await triggerDownload();
  const ids = await waitFor(async () => {
    const found = (await notifications()).filter((n) => n.startsWith('mdr-dl-'));
    return found.length ? found : null; // 空陣列也是 truthy,要明確回 null 才會繼續等
  }, 10000);
  assert(ids?.length, '10 秒內沒有出現通知');
  globalThis.__notificationId = ids[0];
  const [item] = await sw.evaluate((id) => chrome.downloads.search({ id }), Number(ids[0].slice('mdr-dl-'.length)));
  return `通知 ${ids[0]},檔案 ${item.filename.split('/').pop()}`;
});
await check('2 下載', '點通知 → 新分頁開啟並排版', async () => {
  assert(globalThis.__notificationId, '沒有通知可點');
  const opened = context.waitForEvent('page', { timeout: 10000 });
  await sw.evaluate((nid) => openDownloadFromNotification(nid), globalThis.__notificationId);
  const page = await opened;
  await page.waitForLoadState('load');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ mdr: document.documentElement.dataset.mdr || null, zhOk: document.body.innerText.includes('MDR-ZH-OK-繁中正常') }));
  const url = decodeURIComponent(page.url());
  await page.close();
  assert(r.mdr === 'rendered' && r.zhOk, `開啟了 ${url} 但沒有排版`);
  return url.replace(ROOT, '…');
});
await check('2 下載', '「自動開」:下載完直接開分頁、不跳通知', async () => {
  await setSettings({ downloadMode: 'auto' });
  await clearNotifications();
  const opened = context.waitForEvent('page', { timeout: 10000 });
  await triggerDownload();
  const page = await opened;
  await page.waitForLoadState('load');
  await page.waitForTimeout(400);
  const mdr = await page.evaluate(() => document.documentElement.dataset.mdr || null);
  await page.close();
  const n = (await notifications()).length;
  assert(mdr === 'rendered' && n === 0, `mdr=${mdr},通知 ${n} 則`);
  return '自動開啟並排版';
});
await check('2 下載', '「不處理」:沒有通知也不開分頁', async () => {
  await setSettings({ downloadMode: 'off' });
  await clearNotifications();
  let newPage = false;
  const onPage = () => { newPage = true; };
  context.on('page', onPage);
  await triggerDownload();
  await sleep(3000);
  context.off('page', onPage);
  const n = (await notifications()).length;
  await resetSettings();
  assert(!newPage && n === 0, `開了分頁=${newPage},通知 ${n} 則`);
  return '只存檔';
});

// ---------- 收尾 ----------
await browser.close().catch(() => {});
chrome.kill();
server.close();

const version = execFileSync(chromium.executablePath(), ['--version']).toString().trim();
const lines = [`# 自動化測試結果(v${VERSION})`, '', `- 時間:${new Date().toLocaleString('zh-TW')}`, `- 瀏覽器:${version}`, '', '| 分類 | 項目 | 結果 | 說明 |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '\\|')} |`)];
writeFileSync(join(OUTPUT, 'e2e-results.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
