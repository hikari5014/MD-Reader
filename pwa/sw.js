// 背景快取程式:第一次開啟時把整個 App 存進手機,之後沒網路也能用
// 發新版時一定要改 VERSION(npm test:pwa 會檢查跟 package.json 一致),手機才會換成新檔案
const VERSION = '2.0.0';
const CACHE = `mdr-pwa-${VERSION}`;
const E = '../extension/';
// App 本體(流程圖元件 3.5MB 不預先下載:第一次用到時才存)
const SHELL = [
  './', 'index.html', 'read.html', 'platform.js', 'config.js', 'shell.js', 'drive.js', 'home.js', 'read.js', 'pwa.css',
  'manifest.webmanifest', 'vendor/katex.min.css', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  `${E}styles/reader.css`, `${E}styles/ui.css`,
  `${E}core/ui.js`, `${E}core/detect.js`, `${E}core/settings.js`, `${E}core/library.js`, `${E}core/syntax.js`,
  `${E}core/obsidian.js`, `${E}core/render.js`, `${E}core/diagram.js`, `${E}core/reader.js`,
  `${E}vendor/markdown-it.min.js`, `${E}vendor/markdown-it-mark.min.js`, `${E}vendor/markdown-it-footnote.min.js`,
  `${E}vendor/purify.min.js`, `${E}vendor/highlight.min.js`, `${E}vendor/js-yaml.min.js`,
  `${E}vendor/katex/katex.min.js`, `${E}vendor/material-symbols/material-symbols-rounded.woff2`,
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mdr-pwa-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 同網站的檔:先用手機裡存的,沒有才上網拿(拿到順便存起來,例如流程圖元件、公式字型)
// 其他網站(使用者輸入的網址、Google Drive):一律上網拿,不存
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request, { ignoreSearch: true }); // read.html?doc=… 都用同一份
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) cache.put(e.request, res.clone());
    return res;
  })());
});
