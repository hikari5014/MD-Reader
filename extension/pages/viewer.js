// 閱讀頁:viewer.html?src=<網址或 file:// 網址>
// 給「不能就地排版」的入口用(Google Drive、手動開檔、Windows 把 .md 當下載的情況)
(async () => {
  const src = new URLSearchParams(location.search).get('src');
  try {
    if (!src) throw new Error('沒有指定要開啟的檔案');
    const text = await loadText(src);
    const base = document.createElement('base');
    base.href = src; // 讓文件裡的相對圖片、連結指回原本的位置
    document.head.append(base);
    await MDR.mount(document, text, decodeURIComponent(src.split(/[/?#]/).filter(Boolean).pop() || 'Markdown'));
  } catch (e) {
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
    return fetch(src).then((r) => {
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
