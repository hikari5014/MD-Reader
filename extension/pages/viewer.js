// 閱讀頁:給「不能就地排版」的入口用
//   viewer.html?src=<網址或 file:// 網址>  右鍵開啟、小視窗貼網址、Google Drive(&name=檔名)
//   viewer.html?doc=<文件庫 id>            小視窗貼上的文字、開啟檔案頁選的檔
(async () => {
  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  const docId = params.get('doc');
  // 先套主題,載入過場的顏色才會對;讀檔超過 0.3 秒才浮出過場(本機檔通常一閃就好,不顯示)
  MDR.applySettings(document, await MDR.loadSettings());
  try {
    await MDR.withLoader(async () => {
      if (src) {
        const { text, fileName } = await loadText(src);
        const base = document.createElement('base');
        base.href = src; // 讓文件裡的相對圖片、連結指回原本的位置
        document.head.append(base);
        const fallback = params.get('name') || fileName || decodeURIComponent(src.split(/[/?#]/).filter(Boolean).pop() || 'Markdown');
        await MDR.mount(document, text, fallback);
        MDR.addRecent({ title: document.title, src });
      } else if (docId) {
        const doc = await MDR.loadDoc(docId);
        if (!doc) throw new Error('這份文件已經從暫存中清掉了(只保留最近 10 份),請重新貼上或選檔');
        await MDR.mount(document, doc.text, doc.name);
        MDR.addRecent({ title: document.title, doc: docId });
      } else {
        throw new Error('沒有指定要開啟的檔案');
      }
    }, () => MDR.pageLoader.show(MDR.isDriveUrl(src || '') ? '正在從 Google Drive 讀取…' : '正在開啟文件…'), () => MDR.pageLoader.hide());
  } catch (e) {
    const box = document.createElement('div');
    box.className = 'mdr-error';
    const msg = document.createElement('p');
    msg.textContent = `打不開這份文件:${e.message}`;
    box.append(MDR.icon('error'), msg);
    document.body.replaceChildren(box);
    document.documentElement.dataset.mdr = 'error';
  }
})();

// 回傳 { text, fileName }。fetch 不支援 file://,本機檔改用 XMLHttpRequest(需開「允許存取檔案網址」)
async function loadText(src) {
  if (!src.startsWith('file:')) {
    const drive = MDR.isDriveUrl(src);
    const res = await fetch(src, { credentials: 'include' }).catch(() => {
      throw new Error(drive ? '連不上 Google Drive,請檢查網路' : '連不上這個網址,請檢查網路');
    });
    if (!res.ok) throw new Error(drive ? `Google Drive 回應 ${res.status}:可能沒有這個檔案的權限。可以改用 Drive 的「下載」,下載完 MD隨手讀 會跳通知幫你打開` : `伺服器回應 ${res.status}`);
    // 拿到網頁而不是檔案:Drive 多半是沒登入、沒權限;其他網址就是這個網址本來就不是 Markdown 檔
    if ((res.headers.get('content-type') || '').startsWith('text/html')) {
      throw new Error(drive
        ? 'Google Drive 沒有給檔案內容(可能沒登入這個帳號,或沒有權限)。可以改用 Drive 的「下載」,下載完 MD隨手讀 會跳通知幫你打開'
        : '這個網址打開是一般網頁,不是 Markdown 檔');
    }
    const disposition = res.headers.get('content-disposition') || '';
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = disposition.match(/filename="([^"]+)"/i)?.[1];
    return { text: await res.text(), fileName: encoded ? decodeURIComponent(encoded) : plain || '' };
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src);
    xhr.overrideMimeType('text/plain; charset=utf-8');
    xhr.onload = () => resolve({ text: xhr.responseText, fileName: '' });
    xhr.onerror = () => reject(new Error('讀不到本機檔案(可能還沒開「允許存取檔案網址」)'));
    xhr.send();
  });
}
