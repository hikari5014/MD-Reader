// 權限引導頁:帶使用者去開「允許存取檔案網址」,並即時顯示是否已開啟
document.getElementById('open-settings').onclick = () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
};

const status = document.getElementById('status');
async function refresh() {
  const ok = await chrome.extension.isAllowedFileSchemeAccess();
  status.textContent = ok
    ? '✅ 已開啟!回到剛才的 .md 分頁按重新整理,就會看到排版好的畫面。'
    : '⏳ 目前狀態:尚未開啟';
  status.classList.toggle('ok', ok);
}
refresh();
setInterval(refresh, 2000);
