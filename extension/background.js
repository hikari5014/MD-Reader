// 背景管家:安裝引導、打開設定頁、下載處理、Drive 診斷(第 0 期實驗用)
importScripts('core/detect.js', 'core/settings.js');

const NOTIFY_PREFIX = 'mdr-dl-';
const ONBOARDING_URL = chrome.runtime.getURL('pages/onboarding.html');

// 第一次安裝時,若還沒開「允許存取檔案網址」就打開引導頁
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  if (!(await chrome.extension.isAllowedFileSchemeAccess())) chrome.tabs.create({ url: ONBOARDING_URL });
});

// 點工具列上的插件圖示 → 設定頁(v0.3 會改成小視窗,小視窗裡也有設定入口)
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// 下載完成的 .md → 依設定:跳通知 / 自動開 / 不處理
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item || !MDR.isMarkdownPath(item.filename)) return;
  const { downloadMode } = await MDR.loadSettings();
  if (downloadMode === 'auto') return openLocalFile(item.filename);
  if (downloadMode !== 'notify') return;
  chrome.notifications.create(NOTIFY_PREFIX + item.id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'MD隨手讀:下載了一份 Markdown',
    message: `${item.filename.split(/[\\/]/).pop()}\n點這裡用閱讀器打開`,
  });
});

chrome.notifications.onClicked.addListener(openDownloadFromNotification);

async function openDownloadFromNotification(notificationId) {
  if (!notificationId.startsWith(NOTIFY_PREFIX)) return;
  chrome.notifications.clear(notificationId);
  const [item] = await chrome.downloads.search({ id: Number(notificationId.slice(NOTIFY_PREFIX.length)) });
  if (item?.exists) return openLocalFile(item.filename);
}

async function openLocalFile(path) {
  // Chrome 118+:沒開檔案存取權限時,插件無法開 file:// 分頁
  if (!(await chrome.extension.isAllowedFileSchemeAccess())) return chrome.tabs.create({ url: ONBOARDING_URL });
  return chrome.tabs.create({ url: toFileUrl(path) });
}

// /Users/我/a b.md → file:///Users/%E6%88%91/a%20b.md;C:\Users\a.md → file:///C:/Users/a.md
function toFileUrl(path) {
  const encoded = path.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  return ('file://' + (encoded.startsWith('/') ? '' : '/') + encoded).replace(/^file:\/\/\/([A-Za-z])%3A/, 'file:///$1:');
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 閱讀畫面右上角的 ⚙️(content script 不能直接開設定頁,請背景管家代勞)
  if (msg?.type === 'open-options') chrome.runtime.openOptionsPage();
  // 第 0 期實驗:Google Drive 能不能拿到 .md 原文
  if (msg?.type === 'drive-probe') {
    probeDrive(msg.ids).then(sendResponse);
    return true;
  }
});

async function probeDrive(ids) {
  const results = [];
  for (const id of ids.slice(0, 3)) {
    for (const url of [
      `https://drive.google.com/uc?export=download&id=${id}`,
      `https://drive.usercontent.google.com/download?id=${id}&export=download`,
    ]) {
      try {
        const res = await fetch(url, { credentials: 'include' });
        const text = await res.text();
        results.push({ id, url, status: res.status, finalUrl: res.url, type: res.headers.get('content-type'), length: text.length, head: text.slice(0, 200) });
      } catch (e) {
        results.push({ id, url, error: String(e) });
      }
    }
  }
  return results;
}
