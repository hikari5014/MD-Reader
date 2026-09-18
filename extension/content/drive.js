// Google Drive / Google 文件:看到 .md 時,右下角出現「📖 用 MD隨手讀 開啟」
// Google 自己的預覽已能顯示一般 Markdown,這顆按鈕是給 Obsidian 語法(提示框、雙中括號連結、流程圖…)用的
// Drive 是單頁應用程式(網址與畫面會在原地變),所以每秒檢查一次目前的檔案
(() => {
  const MD_NAME = /\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i;
  const MD_IN_TEXT = /([^\n\t]+?\.(?:md|markdown|mdown|mkd|mkdn|mdwn))(?=\s|$)/i;
  const FILE_ID = /^[\w-]{20,}$/;
  let enabled = true;
  let current = null; // { id, name }
  let clicked = null; // 使用者最後點的那一列 { row, id, name }

  // 從 Drive 列表的一列找出檔名(列的文字依序是「檔名 擁有者 日期 大小」)
  function nameOfRow(row) {
    const text = (row.getAttribute('aria-label') || row.innerText || '').trim();
    return text.match(MD_IN_TEXT)?.[1].trim() || null;
  }
  const outerRow = (el) => el.closest('[role="row"]') || el;

  // 記住使用者點了哪一列(登入後的 Drive 不一定用 aria-selected 標記選取,直接看點擊最可靠)
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('#mdr-drive-open')) return;
    const cell = e.target.closest?.('[data-id]');
    const id = cell?.dataset.id;
    clicked = id && FILE_ID.test(id) ? { row: outerRow(cell), id, name: nameOfRow(outerRow(cell)) } : null;
    update();
  }, true);

  // 找出「目前看的 .md 檔」:① 預覽頁 / Google 文件(網址有檔案編號、標題是檔名)② 列表裡選取的那一列 ③ 最後點的那一列
  function findMarkdownFile() {
    const byUrl = location.pathname.match(/\/(?:file|document)\/d\/([\w-]{20,})/);
    const titleName = document.title.replace(/\s+-\s+Google.*$/, '').trim();
    if (byUrl && MD_NAME.test(titleName)) return { id: byUrl[1], name: titleName };
    for (const el of document.querySelectorAll('[data-id][aria-selected="true"]')) {
      const name = nameOfRow(outerRow(el));
      if (name && FILE_ID.test(el.dataset.id)) return { id: el.dataset.id, name };
    }
    if (clicked?.name && clicked.row.isConnected) return { id: clicked.id, name: clicked.name };
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

  // 小視窗打開時會來問「現在選的是哪個 .md」(不受 Drive 按鈕開關影響)
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'drive-current-file') sendResponse({ file: findMarkdownFile() });
  });

  MDR.loadSettings().then((s) => { enabled = s.driveButton; update(); });
  MDR.onSettingsChanged((s) => { enabled = s.driveButton; update(); });
  setInterval(update, 1000);
})();
