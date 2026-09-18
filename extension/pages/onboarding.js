// 權限引導頁:帶使用者去開「允許存取檔案網址」,並即時顯示是否已開啟
MDR.enableRipple(document.body);
MDR.loadSettings().then((s) => MDR.applySettings(document, s));

document.getElementById('open-settings').onclick = () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
};

const status = document.getElementById('status');
let last = null;
async function refresh() {
  const ok = await chrome.extension.isAllowedFileSchemeAccess();
  if (ok === last) return; // 狀態沒變就不重畫(避免動畫一直重播)
  last = ok;
  status.replaceChildren(
    MDR.icon(ok ? 'check_circle' : 'refresh'),
    ok ? '已開啟!回到剛才的 .md 分頁按重新整理,就會看到排版好的畫面。' : '目前狀態:尚未開啟',
  );
  status.classList.toggle('is-ok', ok);
  status.classList.toggle('is-waiting', !ok);
}
refresh();
setInterval(refresh, 2000);
