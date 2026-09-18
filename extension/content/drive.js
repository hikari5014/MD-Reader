// Google Drive / Google 文件:看到 .md 時,右下角出現「📖 用 MD隨手讀 開啟」
// Google 自己的預覽已能顯示一般 Markdown,這顆按鈕是給 Obsidian 語法(提示框、雙中括號連結、流程圖…)用的
// Drive 是單頁應用程式(網址與畫面會在原地變),所以每秒檢查一次目前的檔案
(() => {
  const MD_NAME = /\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i;
  let enabled = true;
  let current = null; // { id, name }

  // 找出「目前看的 .md 檔」:① 預覽頁 / Google 文件(網址有檔案編號、標題是檔名)② Drive 列表裡選取的那一列
  function findMarkdownFile() {
    const byUrl = location.pathname.match(/\/(?:file|document)\/d\/([\w-]{20,})/);
    const titleName = document.title.replace(/\s+-\s+Google.*$/, '').trim();
    if (byUrl && MD_NAME.test(titleName)) return { id: byUrl[1], name: titleName };
    for (const row of document.querySelectorAll('[data-id][aria-selected="true"]')) {
      const label = (row.getAttribute('aria-label') || row.textContent || '').trim();
      const name = label.match(/^(.+?\.(?:md|markdown|mdown|mkd|mkdn|mdwn))(?:\s|$)/i)?.[1];
      if (name && /^[\w-]{20,}$/.test(row.dataset.id)) return { id: row.dataset.id, name };
    }
    return null;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'mdr-drive-open';
  button.style.cssText = [
    'position:fixed', 'right:24px', 'bottom:24px', 'z-index:2147483647', 'display:none', 'max-width:360px',
    'padding:10px 16px', 'border:0', 'border-radius:999px', 'background:#7c5cff', 'color:#fff',
    'font:600 14px/1.3 -apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif',
    'box-shadow:0 6px 20px rgba(0,0,0,.25)', 'cursor:pointer', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
  ].join(';');
  button.addEventListener('click', () => {
    if (current) chrome.runtime.sendMessage({ type: 'open-drive-file', id: current.id, name: current.name });
  });
  document.documentElement.append(button);

  function update() {
    current = enabled ? findMarkdownFile() : null;
    button.style.display = current ? 'block' : 'none';
    if (current) {
      button.textContent = `📖 用 MD隨手讀 開啟 ${current.name}`;
      button.title = `用 MD隨手讀 排版閱讀「${current.name}」(支援 Obsidian 語法)`;
    }
  }

  MDR.loadSettings().then((s) => { enabled = s.driveButton; update(); });
  MDR.onSettingsChanged((s) => { enabled = s.driveButton; update(); });
  setInterval(update, 1000);
})();
