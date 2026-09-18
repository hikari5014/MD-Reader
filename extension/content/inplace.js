// 就地排版:Chrome 把 .md 顯示成純文字時,原地換成排版好的閱讀畫面
// 適用:本機 file:// 與網路上的 .md 網址
(() => {
  if (!MDR.isMarkdownUrl(location.href) || !MDR.isPlainTextDocument(document)) return;
  const pre = document.body.querySelector(':scope > pre');
  const text = pre ? pre.textContent : document.body.textContent;
  const fileName = decodeURIComponent(location.pathname.split('/').pop());
  MDR.mount(document, text, fileName);
})();
