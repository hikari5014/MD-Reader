// 文件庫:最近開過的文件、貼上/選檔的文字暫存、閱讀頁網址
// 存在 chrome.storage.local(只在這台電腦,不同步)。需要先載入 detect.js、settings.js
(() => {
  const MAX_RECENT = 10;
  const MAX_DOCS = 10;
  const VIEWER = chrome.runtime.getURL('pages/viewer.html');

  // entry:{ title, src }(本機或網路檔)或 { title, doc }(貼上/選檔的文字)
  async function addRecent(entry) {
    const { recordRecent } = await MDR.loadSettings();
    if (!recordRecent) return;
    const key = entry.src || entry.doc;
    const kind = entry.doc ? 'text' : entry.src.startsWith('file:') ? 'file' : isDriveUrl(entry.src) ? 'drive' : 'web';
    const recent = await listRecent();
    const next = [{ ...entry, kind, time: Date.now() }, ...recent.filter((r) => (r.src || r.doc) !== key)];
    await chrome.storage.local.set({ recent: next.slice(0, MAX_RECENT) });
  }
  // Google Drive 的檔案下載網址(用檔案編號)
  const driveUrl = (id) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  const isDriveUrl = (url) => /^https:\/\/drive\.(google|usercontent\.google)\.com\/(uc|download)\?/.test(url);

  const listRecent = async () => (await chrome.storage.local.get('recent')).recent || [];

  async function saveDoc(name, text) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { docs = [] } = await chrome.storage.local.get('docs');
    await chrome.storage.local.set({ docs: [{ id, name, text, time: Date.now() }, ...docs].slice(0, MAX_DOCS) });
    return id;
  }
  async function loadDoc(id) {
    const { docs = [] } = await chrome.storage.local.get('docs');
    return docs.find((d) => d.id === id) || null;
  }
  const clearHistory = () => chrome.storage.local.remove(['recent', 'docs']);

  // 新版本提示:記住看過哪一版的更新日誌(第一次安裝時直接記成目前版本,不提示)
  const VERSION = chrome.runtime.getManifest().version;
  const hasUnseenUpdate = async () => (await chrome.storage.local.get('seenVersion')).seenVersion !== VERSION;
  const markUpdateSeen = () => chrome.storage.local.set({ seenVersion: VERSION });

  const viewerUrl = ({ src, doc }) => (src ? `${VIEWER}?src=${encodeURIComponent(src)}` : `${VIEWER}?doc=${encodeURIComponent(doc)}`);

  // 重新打開最近的文件:.md 網址直接開(就地排版,網址好收藏);其他走閱讀頁
  const reopenUrl = (item) => (item.src && MDR.isMarkdownUrl(item.src) ? item.src : viewerUrl(item));

  // 貼上的內容:整段只有一個網址 → 當網址開;否則當 Markdown 文字
  function parsePasted(value) {
    const t = value.trim();
    return /^(https?|file):\/\/\S+$/i.test(t) ? { src: MDR.toRawUrl(t) } : { text: t };
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { addRecent, listRecent, saveDoc, loadDoc, clearHistory, viewerUrl, reopenUrl, parsePasted, driveUrl, isDriveUrl, hasUnseenUpdate, markUpdateSeen });
})();
