// 閱讀頁:給「不能就地排版」的入口用
//   viewer.html?src=<網址或 file:// 網址>  右鍵開啟、小視窗貼網址、(之後)Google Drive
//   viewer.html?doc=<文件庫 id>            小視窗貼上的文字、開啟檔案頁選的檔
(async () => {
  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  const docId = params.get('doc');
  try {
    if (src) {
      const text = await loadText(src);
      const base = document.createElement('base');
      base.href = src; // 讓文件裡的相對圖片、連結指回原本的位置
      document.head.append(base);
      await MDR.mount(document, text, decodeURIComponent(src.split(/[/?#]/).filter(Boolean).pop() || 'Markdown'));
      MDR.addRecent({ title: document.title, src });
    } else if (docId) {
      const doc = await MDR.loadDoc(docId);
      if (!doc) throw new Error('這份文件已經從暫存中清掉了(只保留最近 10 份),請重新貼上或選檔');
      await MDR.mount(document, doc.text, doc.name);
      MDR.addRecent({ title: document.title, doc: docId });
    } else {
      throw new Error('沒有指定要開啟的檔案');
    }
  } catch (e) {
    MDR.applySettings(document, await MDR.loadSettings());
    const box = document.createElement('div');
    box.className = 'mdr-error';
    box.textContent = `打不開這份文件:${e.message}`;
    document.body.replaceChildren(box);
    document.documentElement.dataset.mdr = 'error';
  }
})();

// fetch 不支援 file://,本機檔改用 XMLHttpRequest(需開「允許存取檔案網址」)
function loadText(src) {
  if (!src.startsWith('file:')) {
    return fetch(src, { credentials: 'include' }).then((r) => {
      if (!r.ok) throw new Error(`伺服器回應 ${r.status}`);
      return r.text();
    });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src);
    xhr.overrideMimeType('text/plain; charset=utf-8');
    xhr.onload = () => resolve(xhr.responseText);
    xhr.onerror = () => reject(new Error('讀不到本機檔案(可能還沒開「允許存取檔案網址」)'));
    xhr.send();
  });
}
