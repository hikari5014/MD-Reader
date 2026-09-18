// 自動化測試:用 Chrome for Testing 載入插件,跑完整流程並列出結果
// 用法:npm test    (Google Drive 需登入、系統通知需真人看,改由人工驗收)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchWithExtension } from './lib/launch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const TMP = join(ROOT, 'tests', '.tmp');
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
  // 模擬 drive.usercontent.google.com 的回應格式(附件 + UTF-8 檔名)
  '/drive-like/download': { type: 'application/octet-stream', extra: { 'content-disposition': "attachment; filename*=UTF-8''%E9%80%B1%E6%9C%83%E7%B4%80%E9%8C%84.md" }, body: Buffer.from('# 週會紀錄\n\n> [!tip] 從 Drive 開的\n> 看得懂 Obsidian 提示框 MDR-DRIVE-OK\n') },
  '/drive-like/noh1': { type: 'application/octet-stream', extra: { 'content-disposition': "attachment; filename*=UTF-8''%E7%84%A1%E6%A8%99%E9%A1%8C%E7%AD%86%E8%A8%98.md" }, body: Buffer.from('沒有標題的內容') },
};
const server = http.createServer((req, res) => {
  const route = ROUTES[new URL(req.url, 'http://x').pathname];
  if (!route) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': route.type, ...route.extra }).end(route.body || SAMPLE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- 啟動載入插件的 Chrome for Testing ----------
mkdirSync(OUTPUT, { recursive: true });
const { browser, context, sw, extId: EXT_ID, close } = await launchWithExtension({ extensionDir: EXT, tmpDir: TMP, downloadsDir: DOWNLOADS });
const OPTIONS_URL = `chrome-extension://${EXT_ID}/pages/options.html`;
const setSettings = (patch) => sw.evaluate((p) => chrome.storage.sync.set(p), patch);
const resetSettings = () => sw.evaluate(() => chrome.storage.sync.clear());

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
      dangerous: document.querySelectorAll('.mdr-body script, .mdr-body iframe, .mdr-body [onerror], .mdr-body [onload]').length
        + [...document.querySelectorAll('.mdr-body a[href], .mdr-body img[src]')].filter((el) => /^javascript:/i.test(el.href || el.src)).length,
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
await check('6 設定頁', '更新日誌、使用說明內容與 docs 版本一致', async () => {
  const a = readFileSync(join(ROOT, 'docs', 'changelog', 'CHANGELOG.md'), 'utf8');
  const b = readFileSync(join(EXT, 'CHANGELOG.md'), 'utf8');
  assert(a === b, 'extension/CHANGELOG.md 過期了,請跑 npm run sync');
  assert(readFileSync(join(ROOT, 'docs', 'guide', 'GUIDE.md'), 'utf8') === readFileSync(join(EXT, 'GUIDE.md'), 'utf8'), 'extension/GUIDE.md 過期了,請跑 npm run sync');
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
await check('6 設定頁', '使用說明分頁:排版顯示(表格、提示框)', async () => {
  const page = await open(`${OPTIONS_URL}#guide`, 1200);
  await page.waitForSelector('#guide h2');
  await page.screenshot({ path: join(OUTPUT, 'options-guide.png') });
  const r = await page.evaluate(() => ({ h2: document.querySelectorAll('#guide h2').length, tables: document.querySelectorAll('#guide table').length, callouts: document.querySelectorAll('#guide .callout').length }));
  await page.close();
  assert(r.h2 >= 7 && r.tables >= 3 && r.callouts === 2, JSON.stringify(r));
  return `${r.h2} 個段落、${r.tables} 張表、${r.callouts} 個提示框`;
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

// ========== 7 右鍵・小視窗・最近開過(v0.3)==========
const POPUP_URL = `chrome-extension://${EXT_ID}/pages/popup.html`;
const listRecent = () => sw.evaluate(() => MDR.listRecent());
// 做一個動作,等它開出新分頁,回傳載入完成的新分頁
async function expectNewPage(action) {
  const opened = context.waitForEvent('page', { timeout: 10000 });
  await action();
  const page = await opened;
  await page.waitForLoadState('load');
  await page.waitForTimeout(400);
  return page;
}
const pageState = (page) => page.evaluate(() => ({
  mdr: document.documentElement.dataset.mdr || null,
  zhOk: document.body.innerText.includes('MDR-ZH-OK-繁中正常'),
  text: document.body.innerText.slice(0, 200),
}));

await check('7 右鍵・小視窗', '右鍵選單有建立成功(比對規則沒寫錯)', async () => {
  // 選單不存在時 update 會失敗;targetUrlPatterns 寫錯時 create 就會失敗,選單也不會存在
  const err = await sw.evaluate(() => chrome.contextMenus.update('mdr-open-link', {}).then(() => null, (e) => e.message));
  assert(!err, err);
  return '「用 MD隨手讀 開啟」已註冊';
});
await check('7 右鍵・小視窗', '右鍵 .md 連結 → 閱讀頁開啟', async () => {
  const page = await expectNewPage(() => sw.evaluate((u) => openFromContextMenu({ menuItemId: 'mdr-open-link', linkUrl: u }), `${BASE}/plain/test.md`));
  const r = await pageState(page);
  const url = page.url();
  await page.close();
  assert(r.mdr === 'rendered' && r.zhOk && url.includes('viewer.html?src='), `${url} mdr=${r.mdr}`);
  return 'viewer.html?src=…';
});
await check('7 右鍵・小視窗', '右鍵強制下載的 .md 也能開', async () => {
  const page = await expectNewPage(() => sw.evaluate((u) => openFromContextMenu({ menuItemId: 'mdr-open-link', linkUrl: u }), `${BASE}/attach/test.md`));
  const r = await pageState(page);
  await page.close();
  assert(r.mdr === 'rendered' && r.zhOk, `mdr=${r.mdr}`);
  return '排版成功';
});
await check('7 右鍵・小視窗', 'GitHub / GitLab 檔案頁 → 原始檔網址', async () => {
  const r = await sw.evaluate(() => [
    MDR.toRawUrl('https://github.com/simov/markdown-viewer/blob/main/README.md'),
    MDR.toRawUrl('https://gitlab.com/group/sub/proj/-/blob/main/docs/a.md'),
    MDR.toRawUrl('https://example.com/a.md'),
  ]);
  assert(r[0] === 'https://raw.githubusercontent.com/simov/markdown-viewer/main/README.md'
    && r[1] === 'https://gitlab.com/group/sub/proj/-/raw/main/docs/a.md'
    && r[2] === 'https://example.com/a.md', r.join(' | '));
  return 'GitHub、GitLab 轉換正確,其他網址不動';
});
await check('7 右鍵・小視窗', '小視窗:貼上文字 → 排版', async () => {
  const popup = await open(POPUP_URL, 340);
  await popup.fill('#paste', '# 貼上測試\n\n- [x] 小視窗貼上的文字 MDR-PASTE-OK');
  const page = await expectNewPage(() => popup.click('#paste-go'));
  const r = await pageState(page);
  const boxes = await page.locator('.mdr-body input[type=checkbox]').count();
  await page.close();
  await popup.close().catch(() => {});
  assert(r.mdr === 'rendered' && r.text.includes('MDR-PASTE-OK') && boxes === 1, JSON.stringify(r));
  return '排版成功(含勾選框)';
});
await check('7 右鍵・小視窗', '小視窗:貼上網址 → 開那個網址', async () => {
  const popup = await open(POPUP_URL, 340);
  await popup.fill('#paste', `  ${BASE}/nocharset/test.md  `);
  const page = await expectNewPage(() => popup.click('#paste-go'));
  const r = await pageState(page);
  await page.close();
  await popup.close().catch(() => {});
  assert(r.mdr === 'rendered' && r.zhOk, `mdr=${r.mdr}`);
  return '網址排版成功';
});
await check('7 右鍵・小視窗', '開啟檔案頁:選檔 → 排版', async () => {
  const page = await open(`chrome-extension://${EXT_ID}/pages/open.html`);
  await page.screenshot({ path: join(OUTPUT, 'open-page.png') });
  await page.setInputFiles('#file', join(ROOT, 'test-files', 'sample-zh.md'));
  await page.waitForURL(/viewer\.html\?doc=/);
  await page.waitForTimeout(400);
  const r = await pageState(page);
  await page.close();
  assert(r.mdr === 'rendered' && r.zhOk, `mdr=${r.mdr}`);
  return '選檔後換成閱讀頁';
});
await check('7 右鍵・小視窗', '閱讀頁:暫存文件被清掉時顯示說明', async () => {
  const page = await open(`chrome-extension://${EXT_ID}/pages/viewer.html?doc=not-exist`);
  const r = await pageState(page);
  await page.close();
  assert(r.mdr === 'error' && r.text.includes('清掉'), r.text);
  return r.text.slice(0, 30) + '…';
});
await check('7 右鍵・小視窗', '最近開過:依時間排列,點了重新打開', async () => {
  await sw.evaluate(() => MDR.clearHistory());
  for (const f of ['sample-zh.md', 'tasks-lists.md']) await (await open(fileUrl(f))).close();
  const popup = await open(POPUP_URL, 340);
  await popup.screenshot({ path: join(OUTPUT, 'popup.png') });
  const items = await popup.$$eval('#recent li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ')));
  assert(items.length === 2 && items[0].includes('清單與待辦測試') && items[0].includes('本機') && items[1].includes('繁體中文測試文件'), JSON.stringify(items));
  const page = await expectNewPage(() => popup.click('#recent li:nth-child(2) button'));
  const r = await pageState(page);
  const url = decodeURIComponent(page.url());
  await page.close();
  await popup.close().catch(() => {});
  assert(r.mdr === 'rendered' && r.zhOk && url.startsWith('file://'), url);
  return `${items.length} 筆,點第 2 筆 → ${url.split('/').pop()}`;
});
await check('7 右鍵・小視窗', '關閉「記錄最近開過」→ 不再記錄', async () => {
  await setSettings({ recordRecent: false });
  const before = (await listRecent()).length;
  await (await open(fileUrl('code-langs.md'))).close();
  const after = (await listRecent()).length;
  const popup = await open(POPUP_URL, 340);
  const empty = await popup.textContent('#recent-empty');
  await popup.close();
  await resetSettings();
  assert(before === after && empty.includes('已關閉'), `${before} → ${after},小視窗顯示「${empty}」`);
  return '沒有新增紀錄,小視窗顯示已關閉';
});
await check('7 右鍵・小視窗', '設定頁「清除最近紀錄」', async () => {
  assert((await listRecent()).length > 0, '測試前應該要有紀錄');
  const page = await open(`${OPTIONS_URL}#reading`, 1200);
  await page.click('#clear-history');
  await sleep(300);
  const r = await sw.evaluate(() => chrome.storage.local.get(null));
  await page.close();
  assert(!r.recent && !r.docs, JSON.stringify(Object.keys(r)));
  return '清單與貼上文字都清掉了';
});
await check('7 右鍵・小視窗', '小視窗:⚙️ 設定、📜 更新日誌、權限提醒', async () => {
  let popup = await open(POPUP_URL, 340);
  const warnHidden = await popup.$eval('#warn', (el) => el.hidden);
  const settingsPage = await expectNewPage(() => popup.click('#open-settings'));
  const u1 = settingsPage.url();
  await settingsPage.close();
  await popup.close().catch(() => {});
  popup = await open(POPUP_URL, 340);
  const logPage = await expectNewPage(() => popup.click('#open-changelog'));
  await logPage.waitForSelector('#changelog h2');
  const u2 = logPage.url();
  await logPage.close();
  await popup.close().catch(() => {});
  assert(u1.startsWith(OPTIONS_URL) && u2.endsWith('#changelog') && warnHidden === fileAccess, `${u1} / ${u2} / warnHidden=${warnHidden}`);
  return '兩個入口都正確;已有權限時不顯示提醒';
});

// ========== 8 Obsidian 語法・流程圖・數學(v0.4)==========
await check('8 Obsidian', '屬性表', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  await page.screenshot({ path: join(OUTPUT, 'obsidian-top.png') });
  const r = await page.evaluate(() => {
    const box = document.querySelector('.mdr-props');
    const row = (k) => [...box.querySelectorAll('.mdr-prop-key')].find((e) => e.textContent === k)?.nextElementSibling;
    return {
      first: document.querySelector('.mdr-body').firstElementChild === box,
      keys: box.querySelectorAll('.mdr-prop-key').length,
      tags: [...row('tags').querySelectorAll('.mdr-prop-pill')].map((p) => p.textContent),
      date: row('date').textContent,
      done: row('done').querySelector('input')?.checked,
      related: [...row('related').querySelectorAll('a.internal-link')].map((a) => a.getAttribute('href')),
      source: row('source').querySelector('a')?.href,
      empty: row('empty').textContent,
      nested: [...row('children').querySelectorAll('a.internal-link')].map((a) => a.getAttribute('href')).join(),
      nestedRaw: row('children').textContent.includes('[['),
      title: document.title,
    };
  });
  await page.close();
  assert(r.first && r.keys === 11 && r.nested === 'sample-zh.md' && !r.nestedRaw && r.tags.join() === '測試,obsidian' && r.date === '2026-09-18' && r.done === true
    && r.related.join() === 'sample-zh.md,toc-long.md' && r.source === 'https://obsidian.md/' && r.empty === '—' && r.title === 'Obsidian 語法大全', JSON.stringify(r));
  return '11 個屬性:清單、日期、勾選、連結、空值、巢狀都正確';
});
await check('8 Obsidian', '屬性格式不標準時盡量讀出來並提醒', async () => {
  const page = await open(fileUrl('obsidian-loose-props.md'));
  const r = await page.evaluate(() => {
    const box = document.querySelector('.mdr-props');
    const row = (k) => [...box.querySelectorAll('.mdr-prop-key')].find((e) => e.textContent === k)?.nextElementSibling;
    return {
      raw: !!box.querySelector('.mdr-props-raw'),
      note: !!box.querySelector('.mdr-props-note'),
      title: row('title')?.textContent,
      tags: [...(row('tags')?.querySelectorAll('.mdr-prop-pill') || [])].map((p) => p.textContent),
      related: [...(row('related')?.querySelectorAll('a.internal-link') || [])].map((a) => a.getAttribute('href')),
    };
  });
  await page.close();
  assert(!r.raw && r.note && r.title === '屬性格式不標準的筆記' && r.tags.join() === '論文,測試' && r.related.join() === 'sample-zh.md,toc-long.md', JSON.stringify(r));
  return '讀出 4 個屬性(含 2 個連結)+ 格式提醒';
});
await check('8 Obsidian', '雙中括號連結:同資料夾、段落、區塊', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  const r = await page.evaluate(() => {
    const href = (t) => document.querySelector(`.mdr-body > p a.internal-link[data-href="${t}"]`)?.getAttribute('href');
    const label = (t) => document.querySelector(`.mdr-body > p a.internal-link[data-href="${t}"]`)?.textContent;
    return {
      plain: href('sample-zh'),
      alias: label('toc-long'),
      heading: href('toc-long#第 3 章 章節標題'),
      headingLabel: label('toc-long#第 3 章 章節標題'),
      self: href('#提示框'),
      block: href('#^block-1'),
      blockTarget: !!document.getElementById('^block-1'),
      blockHidden: !document.body.innerText.includes('^block-1'),
    };
  });
  const [nav] = await Promise.all([page.waitForNavigation(), page.click('.mdr-body > p a.internal-link[data-href="sample-zh"]')]);
  await page.waitForTimeout(400);
  const landed = await page.evaluate(() => document.body.innerText.includes('MDR-ZH-OK-繁中正常'));
  await page.close();
  assert(r.plain === 'sample-zh.md' && r.alias === '長文件目錄' && r.heading === `toc-long.md#${encodeURIComponent('第-3-章-章節標題')}`
    && r.headingLabel === 'toc-long > 第 3 章 章節標題' && r.self === `#${encodeURIComponent('提示框')}` && r.block === '#%5Eblock-1'
    && r.blockTarget && r.blockHidden && landed, JSON.stringify({ ...r, landed }));
  return '網址正確,點了能跳到另一篇';
});
await check('8 Obsidian', '填了保險庫名稱 → 連結改成用 Obsidian 打開(即時)', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  const opt = await open(`${OPTIONS_URL}#reading`, 1200);
  await opt.fill('input[data-key="obsidianVault"]', 'LLM Wiki');
  await opt.press('input[data-key="obsidianVault"]', 'Enter');
  await sleep(500);
  const href = await page.getAttribute('.mdr-body > p a.internal-link[data-href="sample-zh"]', 'href');
  const prop = await page.getAttribute('.mdr-props a.internal-link', 'href');
  await opt.close();
  await page.close();
  await resetSettings();
  const want = 'obsidian://open?vault=LLM%20Wiki&file=sample-zh';
  assert(href === want && prop === want, `${href} / ${prop}`);
  return want;
});
await check('8 Obsidian', '提示框:類型、標題、收合、巢狀、別名', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.callout')];
    const by = (t) => document.querySelector(`.callout[data-callout="${t}"]`);
    const title = (el) => el?.querySelector(':scope > .callout-title').textContent.trim();
    return {
      count: all.length,
      types: all.map((c) => c.dataset.callout).join(),
      noteTitle: title(by('note')),
      tipTitle: title(by('tip')),
      tipHasLink: !!by('tip').querySelector('.callout-content a.internal-link'),
      tipColor: getComputedStyle(by('tip').querySelector('.callout-title')).color,
      warnFolded: by('warning').tagName === 'DETAILS' && !by('warning').open,
      successOpen: by('success').tagName === 'DETAILS' && by('success').open,
      nested: !!by('question').querySelector('.callout-content .callout[data-callout="danger"]'),
      plainQuote: document.querySelectorAll('.mdr-body > blockquote').length,
      leftover: document.body.innerText.includes('[!'),
    };
  });
  await page.click('.callout[data-callout="warning"] > summary');
  const unfolded = await page.isVisible('text=MDR-FOLD-OK');
  await page.screenshot({ path: join(OUTPUT, 'obsidian-callouts.png'), fullPage: true });
  await page.close();
  assert(r.count === 8 && r.noteTitle === 'Note' && r.tipTitle === '有標題的提示框' && r.tipHasLink && r.tipColor === 'rgb(0, 191, 188)'
    && r.warnFolded && r.successOpen && r.nested && r.plainQuote === 1 && !r.leftover && unfolded
    && r.types === 'note,tip,warning,success,question,danger,question,quote', JSON.stringify({ ...r, unfolded }));
  return '8 個提示框(含巢狀、收合、別名 faq→question)';
});
await check('8 Obsidian', '螢光筆、標籤、註解', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  const r = await page.evaluate(() => ({
    mark: document.querySelector('.mdr-body mark')?.textContent,
    tags: [...document.querySelectorAll('.mdr-body > p .mdr-tag')].map((t) => t.textContent),
    codeTag: !!document.querySelector('code .mdr-tag'),
    comment: /看不到我|整段註解/.test(document.body.innerText),
  }));
  await page.close();
  assert(r.mark === '螢光筆' && r.tags.join() === '#標籤,#巢狀/標籤' && !r.codeTag && !r.comment, JSON.stringify(r));
  return `螢光筆 ✓、標籤 ${r.tags.join(' ')}、註解已隱藏`;
});
await check('8 Obsidian', '嵌入:到附件資料夾找圖、指定寬度、找不到的提示、嵌入筆記', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img.mdr-embed-img')];
    return {
      loaded: imgs.map((i) => i.naturalWidth),
      src: imgs[0]?.getAttribute('src'),
      width: imgs[1]?.getAttribute('width'),
      missing: document.querySelector('.mdr-embed-missing')?.textContent,
      note: document.querySelector('a.mdr-embed-note')?.getAttribute('href'),
    };
  });
  await page.close();
  assert(r.loaded.length === 2 && r.loaded.every((w) => w > 0) && r.src === 'images/sample.png' && r.width === '64'
    && r.missing?.includes('不存在的圖.png') && r.note === 'sample-zh.md', JSON.stringify(r));
  return `在 ${r.src} 找到圖`;
});
await check('8 Obsidian', '腳註', async () => {
  const page = await open(fileUrl('obsidian-note.md'));
  const r = await page.evaluate(() => ({ refs: document.querySelectorAll('.mdr-body sup.footnote-ref').length, notes: document.querySelectorAll('.mdr-body .footnotes li').length }));
  await page.close();
  assert(r.refs === 2 && r.notes === 2, JSON.stringify(r));
  return '2 個腳註';
});
await check('8 Obsidian', '關閉「顯示屬性表」', async () => {
  await setSettings({ showProperties: false });
  const page = await open(fileUrl('obsidian-note.md'));
  const hidden = await page.$eval('.mdr-props', (el) => el.hidden);
  await page.close();
  await resetSettings();
  assert(hidden, '屬性表仍然顯示');
  return '屬性表隱藏';
});
await check('8 Obsidian', '數學公式(含字型)、價錢不誤判、錯誤公式', async () => {
  const page = await open(fileUrl('math.md'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUTPUT, 'math.png') });
  const r = await page.evaluate(() => ({
    katex: document.querySelectorAll('.mdr-body .katex').length,
    blocks: document.querySelectorAll('.mdr-body .katex-display').length,
    price: document.body.innerText.includes('這杯 $5,那杯 $10'),
    error: !!document.querySelector('.mdr-body .katex-error'),
    font: [...document.fonts].some((f) => f.family.includes('KaTeX_Main') && f.status === 'loaded'),
  }));
  await page.close();
  assert(r.katex === 5 && r.blocks === 3 && r.price && r.error && r.font, JSON.stringify(r));
  return `${r.katex} 個公式(${r.blocks} 個區塊),KaTeX 字型已載入`;
});
await check('8 Obsidian', 'Mermaid:流程圖、循序圖、語法錯誤的說明', async () => {
  const page = await open(fileUrl('mermaid.md'));
  await page.waitForSelector('.mdr-mermaid svg', { timeout: 15000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({
    svgs: document.querySelectorAll('.mdr-mermaid svg').length,
    errors: document.querySelectorAll('.mdr-mermaid.is-error').length,
    label: document.querySelector('.mdr-mermaid')?.textContent.includes('排版顯示'),
    stray: document.querySelectorAll('body > [id^="dmdr-mermaid"]').length,
  }));
  await page.screenshot({ path: join(OUTPUT, 'mermaid.png'), fullPage: true });
  await page.close();
  assert(r.svgs === 2 && r.errors === 1 && r.label && r.stray === 0, JSON.stringify(r));
  return '2 張圖 + 1 個錯誤說明';
});
await check('8 Obsidian', 'Mermaid:切深色主題會重畫', async () => {
  const page = await open(fileUrl('mermaid.md'));
  await page.waitForSelector('.mdr-mermaid svg', { timeout: 15000 });
  const before = await page.$eval('.mdr-mermaid svg', (s) => s.outerHTML.length + s.querySelector('style')?.textContent.slice(0, 400));
  await setSettings({ theme: 'dark' });
  await page.waitForFunction((b) => {
    const s = document.querySelector('.mdr-mermaid svg');
    return s && s.outerHTML.length + s.querySelector('style')?.textContent.slice(0, 400) !== b;
  }, before, { timeout: 10000 });
  await page.screenshot({ path: join(OUTPUT, 'mermaid-dark.png') });
  await page.close();
  await resetSettings();
  return '配色已更新';
});
await check('8 Obsidian', '閱讀頁也能畫流程圖;沒有流程圖的文件不載入元件', async () => {
  const viewer = (f) => `chrome-extension://${EXT_ID}/pages/viewer.html?src=${encodeURIComponent(fileUrl(f))}`;
  const page = await open(viewer('mermaid.md'));
  await page.waitForSelector('.mdr-mermaid svg', { timeout: 15000 });
  const svgs = await page.$$eval('.mdr-mermaid svg', (s) => s.length);
  await page.close();
  const plain = await open(viewer('sample-zh.md'));
  const loaded = await plain.evaluate(() => typeof window.mermaid !== 'undefined');
  await plain.close();
  assert(svgs === 2 && !loaded, `svgs=${svgs}, 一般文件載入了 mermaid=${loaded}`);
  return '閱讀頁 2 張圖;一般文件沒載入';
});

// ========== 9 Google Drive(v0.5)==========
// Drive 頁面需要登入,用模擬頁面測按鈕的判斷邏輯(真實結構已確認:標題「檔名 - Google 雲端硬碟」、列表列有 data-id)
// 閱讀頁的下載則打真正的 Google(模擬攔不到插件頁面的請求):公開檔測成功路線、不存在的編號測錯誤路線
const DRIVE_MD = 'AAAAAAAAAAAAAAAAAAAAmdfile1';
const DRIVE_PDF = 'BBBBBBBBBBBBBBBBBBBBpdfile1';
const DRIVE_NOACCESS = 'CCCCCCCCCCCCCCCCCCnoaccess';
const fakePage = (title, body = '') => ({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>${title}</title><body>${body}</body>` });
await context.route(/^https:\/\/(drive|docs)\.google\.com\/(file|document|drive)\//, (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === `/file/d/${DRIVE_MD}/view`) return route.fulfill(fakePage('週會紀錄.md - Google 雲端硬碟', '<div>預覽</div>'));
  if (url.pathname === `/file/d/${DRIVE_NOACCESS}/view`) return route.fulfill(fakePage('機密.md - Google Drive'));
  if (url.pathname === `/file/d/${DRIVE_PDF}/view`) return route.fulfill(fakePage('README.pdf - Google 雲端硬碟'));
  if (url.pathname === `/document/d/${DRIVE_MD}/edit`) return route.fulfill(fakePage('週會紀錄.md - Google 文件'));
  if (url.pathname.startsWith('/drive/u/0/folders/')) { // 模擬登入後的列表:沒有 aria-selected 標記,檔名在巢狀元素裡
    return route.fulfill(fakePage('manuscript - Google 雲端硬碟', `<div role="grid">
      <div role="row" data-id="${DRIVE_PDF}"><div data-id="${DRIVE_PDF}"><span class="name">README.pdf</span></div><div>我</div><div>上午9:37</div></div>
      <div role="row" data-id="${DRIVE_MD}"><div data-id="${DRIVE_MD}"><span class="name">週會紀錄.md</span></div><div>我</div><div>上午9:37</div><div>7 KB</div></div>
      <div id="empty-area" style="height:200px">空白處</div></div>`));
  }
  if (url.pathname.startsWith('/drive/folders/')) {
    return route.fulfill(fakePage('資料夾 - Google 雲端硬碟', `<table>
      <tr role="row" data-id="${DRIVE_PDF}" aria-selected="false" aria-label="README.pdf 已共用 1.9 MB"><td>README.pdf</td></tr>
      <tr role="row" data-id="${DRIVE_MD}" aria-selected="false" aria-label="週會紀錄.md 已共用 1 KB"><td>週會紀錄.md</td></tr></table>`));
  }
  return route.fulfill(fakePage('Google 雲端硬碟'));
});
const driveButton = (page) => page.evaluate(() => {
  const b = document.getElementById('mdr-drive-open');
  return b && b.style.display !== 'none' ? b.textContent : null;
});
await check('9 Google Drive', '預覽頁(.md)出現按鈕,按下去開閱讀頁並帶上檔案編號與檔名', async () => {
  const page = await open(`https://drive.google.com/file/d/${DRIVE_MD}/view`);
  await page.waitForTimeout(1200);
  const label = await driveButton(page);
  assert(label?.includes('週會紀錄.md'), `按鈕:${label}`);
  const viewer = await expectNewPage(() => page.click('#mdr-drive-open'));
  const url = new URL(viewer.url());
  await viewer.close();
  await page.close();
  const src = url.searchParams.get('src');
  assert(url.pathname.endsWith('/pages/viewer.html') && src === `https://drive.google.com/uc?export=download&id=${DRIVE_MD}` && url.searchParams.get('name') === '週會紀錄.md', url.href);
  return `按鈕「${label}」→ viewer.html?src=…uc?export=download&id=…`;
});
await check('9 Google Drive', '閱讀頁排版 Drive 格式的回應(附件、檔名、Obsidian 語法)', async () => {
  const viewer = (path, name = '') => `chrome-extension://${EXT_ID}/pages/viewer.html?src=${encodeURIComponent(BASE + path)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
  const page = await open(viewer('/drive-like/download'));
  const r = await page.evaluate(() => ({ mdr: document.documentElement.dataset.mdr, ok: document.body.innerText.includes('MDR-DRIVE-OK'), callout: !!document.querySelector('.callout[data-callout="tip"]'), title: document.title }));
  await page.close();
  const noH1 = await open(viewer('/drive-like/noh1'));
  const t = await noH1.title();
  await noH1.close();
  assert(r.mdr === 'rendered' && r.ok && r.callout && r.title === '週會紀錄' && t === '無標題筆記.md', JSON.stringify({ ...r, noH1Title: t }));
  return '排版成功;沒有標題時用伺服器給的檔名「無標題筆記.md」';
});
await check('9 Google Drive', '真實 Google Drive:公開檔經轉址下載成功(需連網)', async () => {
  const PUBLIC_PDF = '1MpnIzKNcYjDcW0e7tOF0HJLe8eHjo8Lw'; // 網路上公開的 README.pdf,只用來驗證下載路線
  const page = await open(`chrome-extension://${EXT_ID}/pages/viewer.html?src=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${PUBLIC_PDF}`)}`);
  await page.waitForFunction(() => document.documentElement.dataset.mdr !== 'loading', null, { timeout: 30000 });
  const r = await page.evaluate(() => ({ mdr: document.documentElement.dataset.mdr, title: document.title, error: document.querySelector('.mdr-error')?.textContent }));
  await page.close();
  assert(r.mdr === 'rendered' && r.title === 'README.pdf', JSON.stringify(r));
  return '303 轉址 → drive.usercontent.google.com → 取得內容與檔名 README.pdf';
});
await check('9 Google Drive', '真實 Google Drive:檔案不存在/沒權限時說明原因(需連網)', async () => {
  const page = await open(`https://drive.google.com/file/d/${DRIVE_NOACCESS}/view`);
  await page.waitForTimeout(1200);
  const viewer = await expectNewPage(() => page.click('#mdr-drive-open'));
  await viewer.waitForFunction(() => document.documentElement.dataset.mdr !== 'loading', null, { timeout: 30000 });
  const r = await pageState(viewer);
  await viewer.close();
  await page.close();
  assert(r.mdr === 'error' && r.text.includes('Google Drive') && r.text.includes('下載'), r.text);
  return r.text.slice(0, 44) + '…';
});
await check('9 Google Drive', '網址其實是一般網頁時,不把網頁原始碼當文件', async () => {
  const page = await open(`chrome-extension://${EXT_ID}/pages/viewer.html?src=${encodeURIComponent(`${BASE}/html/README.md`)}`);
  const r = await pageState(page);
  await page.close();
  assert(r.mdr === 'error' && r.text.includes('不是 Markdown'), r.text);
  return r.text;
});
await check('9 Google Drive', '不是 .md 的檔案不出現按鈕', async () => {
  const page = await open(`https://drive.google.com/file/d/${DRIVE_PDF}/view`);
  await page.waitForTimeout(1200);
  const label = await driveButton(page);
  await page.close();
  assert(label === null, `PDF 也出現按鈕:${label}`);
  return 'PDF 沒有按鈕';
});
await check('9 Google Drive', '檔案列表:選取 .md 才出現按鈕', async () => {
  const page = await open('https://drive.google.com/drive/folders/fake');
  await page.waitForTimeout(1200);
  const none = await driveButton(page);
  await page.evaluate((id) => document.querySelector(`[data-id="${id}"]`).setAttribute('aria-selected', 'true'), DRIVE_MD);
  await page.waitForTimeout(1200);
  const selected = await driveButton(page);
  await page.close();
  assert(none === null && selected?.includes('週會紀錄.md'), `沒選:${none};選了:${selected}`);
  return '沒選不顯示,選了 .md 才顯示';
});
await check('9 Google Drive', '登入後的列表(沒有選取標記):點了 .md 那一列就出現按鈕', async () => {
  const page = await open('https://drive.google.com/drive/u/0/folders/fake');
  await page.waitForTimeout(1200);
  const none = await driveButton(page);
  await page.click('[role="row"][data-id="' + DRIVE_MD + '"] .name');
  await page.waitForTimeout(300);
  const md = await driveButton(page);
  await page.click('[role="row"][data-id="' + DRIVE_PDF + '"] .name');
  await page.waitForTimeout(300);
  const pdf = await driveButton(page);
  await page.click('#empty-area');
  await page.waitForTimeout(300);
  const empty = await driveButton(page);
  await page.close();
  assert(none === null && md?.includes('週會紀錄.md') && pdf === null && empty === null, JSON.stringify({ none, md, pdf, empty }));
  return '點 .md 出現、點 PDF 或空白處消失';
});
await check('9 Google Drive', '在 Drive 上打開小視窗:直接開目前選的 .md', async () => {
  const drive = await open('https://drive.google.com/drive/u/0/folders/fake');
  await drive.waitForTimeout(1200);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://drive.google.com/drive/u/0/*' }))[0]?.id);
  let popup = await open(`${POPUP_URL}?tab=${tabId}`, 340);
  await popup.waitForTimeout(300);
  const hint = await popup.textContent('#drive');
  await popup.close();
  await drive.click('[role="row"][data-id="' + DRIVE_MD + '"] .name');
  popup = await open(`${POPUP_URL}?tab=${tabId}`, 340);
  await popup.waitForSelector('#drive-open');
  await popup.screenshot({ path: join(OUTPUT, 'popup-drive.png') });
  const label = await popup.textContent('#drive-open');
  const viewer = await expectNewPage(() => popup.click('#drive-open'));
  const src = new URL(viewer.url()).searchParams.get('src');
  await viewer.close();
  await popup.close().catch(() => {});
  await drive.close();
  assert(hint.includes('點一下 .md') && label.includes('週會紀錄.md') && src === `https://drive.google.com/uc?export=download&id=${DRIVE_MD}`, JSON.stringify({ hint, label, src }));
  return '沒選時提示;選了 .md 後一鍵開啟';
});
await check('9 Google Drive', 'Google 文件的 Markdown 模式也有按鈕', async () => {
  const page = await open(`https://docs.google.com/document/d/${DRIVE_MD}/edit`);
  await page.waitForTimeout(1200);
  const label = await driveButton(page);
  await page.close();
  assert(label?.includes('週會紀錄.md'), `按鈕:${label}`);
  return label;
});
await check('9 Google Drive', '最近開過標示為 Drive;關掉設定就不顯示按鈕', async () => {
  const recent = await listRecent();
  const drive = recent.find((r) => r.kind === 'drive');
  await setSettings({ driveButton: false });
  const page = await open(`https://drive.google.com/file/d/${DRIVE_MD}/view`);
  await page.waitForTimeout(1200);
  const label = await driveButton(page);
  await page.close();
  await resetSettings();
  assert(drive?.title === 'README.pdf' && label === null, JSON.stringify({ drive, label }));
  return '☁️ Drive 紀錄 ✓、按鈕可關閉 ✓';
});
await context.unroute(/^https:\/\/(drive|docs)\.google\.com\/(file|document|drive)\//);

// ========== 10 打磨(v0.6)==========
await check('10 打磨', '護眼主題:主題按鈕第 4 下、米黃底色', async () => {
  const page = await open(fileUrl('sample-zh.md'));
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.click('.mdr-toolbar [data-action="theme"]');
    await page.waitForTimeout(250);
    seen.push(await page.evaluate(() => document.documentElement.dataset.mdrTheme));
  }
  await page.click('.mdr-toolbar [data-action="theme"]'); // 回到淺色看一眼順序正確後,再切到護眼截圖
  await setSettings({ theme: 'sepia' });
  await page.waitForTimeout(300);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.screenshot({ path: join(OUTPUT, 'render-sepia.png') });
  await page.close();
  await resetSettings();
  assert(seen.join('→') === 'light→dark→sepia→system' && bg === 'rgb(245, 239, 224)', `${seen.join('→')}、背景 ${bg}`);
  return `${seen.join(' → ')};護眼背景 ${bg}`;
});
await check('10 打磨', '閱讀進度條:捲到底 100%、可關閉', async () => {
  const page = await open(fileUrl('toc-long.md'));
  const top = await page.$eval('.mdr-progress span', (s) => s.style.width);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const bottom = await page.$eval('.mdr-progress span', (s) => s.style.width);
  await setSettings({ progressBar: false });
  await page.waitForTimeout(300);
  const hidden = await page.$eval('.mdr-progress', (el) => el.hidden);
  await page.close();
  await resetSettings();
  assert(top === '0%' && bottom === '100%' && hidden, JSON.stringify({ top, bottom, hidden }));
  return `${top} → ${bottom};關閉後隱藏`;
});
await check('10 打磨', '列印按鈕;列印時只印內文', async () => {
  const page = await open(fileUrl('toc-long.md'));
  const hasButton = await page.$('.mdr-toolbar [data-action="print"]') !== null;
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => ['.mdr-toolbar', '.mdr-toc', '.mdr-progress'].map((q) => getComputedStyle(document.querySelector(q)).display));
  await page.close();
  assert(hasButton && r.every((d) => d === 'none'), JSON.stringify({ hasButton, r }));
  return '工具列、目錄、進度條在列印時都隱藏';
});
await check('10 打磨', '新版本提示:紅點 → 點了看更新日誌 → 紅點消失', async () => {
  const fresh = await open(fileUrl('sample-zh.md'));
  const before = await fresh.$eval('[data-action="settings"]', (b) => b.classList.contains('has-update'));
  await fresh.close();
  await sw.evaluate(() => chrome.storage.local.set({ seenVersion: '0.0.1' })); // 模擬剛從舊版更新上來
  const popup = await open(POPUP_URL, 340);
  const popupBadge = await popup.$eval('#open-changelog', (b) => b.classList.contains('has-update'));
  await popup.close();
  const page = await open(fileUrl('sample-zh.md'));
  const dot = await page.$eval('[data-action="settings"]', (b) => b.classList.contains('has-update'));
  const log = await expectNewPage(() => page.click('[data-action="settings"]'));
  await log.waitForSelector('#changelog h2');
  const url = log.url();
  await log.close();
  await page.close();
  const after = await open(fileUrl('sample-zh.md'));
  const gone = !(await after.$eval('[data-action="settings"]', (b) => b.classList.contains('has-update')));
  await after.close();
  assert(!before && popupBadge && dot && url.endsWith('#changelog') && gone, JSON.stringify({ before, popupBadge, dot, url, gone }));
  return '剛安裝不提示;更新後小視窗與 ⚙️ 都提示;看過就消失';
});
await check('10 打磨', 'Windows 後援:Chrome 把本機 .md 當下載 → 閱讀頁直接開原檔', async () => {
  await clearNotifications();
  const src = fileUrl('sample-zh.md');
  const page = await expectNewPage(() => sw.evaluate((u) => handleDownloadComplete({ id: 0, url: u, filename: 'C:\\Users\\me\\Downloads\\sample-zh.md' }), src));
  const r = await pageState(page);
  const url = new URL(page.url());
  await page.close();
  const n = (await notifications()).length;
  assert(r.mdr === 'rendered' && r.zhOk && url.searchParams.get('src') === src && n === 0, JSON.stringify({ mdr: r.mdr, src: url.searchParams.get('src'), n }));
  return '開原檔、不跳下載通知';
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
await close();
server.close();

const version = execFileSync(chromium.executablePath(), ['--version']).toString().trim();
const lines = [`# 自動化測試結果(v${VERSION})`, '', `- 時間:${new Date().toLocaleString('zh-TW')}`, `- 瀏覽器:${version}`, '', '| 分類 | 項目 | 結果 | 說明 |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '\\|')} |`)];
writeFileSync(join(OUTPUT, 'e2e-results.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} 通過 / ${failed} 失敗`);
process.exit(failed ? 1 : 0);
