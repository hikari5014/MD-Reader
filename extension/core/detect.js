// 辨識器:判斷一個網址、檔名或頁面是不是 Markdown
// 背景管家(importScripts)、頁面小程式、閱讀頁共用
(() => {
  const MD_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i;
  const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown', 'application/markdown'];

  // 檔名或路徑(含 Windows 路徑)是否以 Markdown 副檔名結尾
  function isMarkdownPath(path) {
    return MD_EXT.test(String(path || '').split(/[?#]/)[0]);
  }

  function isMarkdownUrl(url) {
    try {
      return isMarkdownPath(decodeURIComponent(new URL(url).pathname));
    } catch {
      return false;
    }
  }

  // Chrome 是否把這一頁當純文字顯示(排除 GitHub 這類本來就是網頁的 .md 網址)
  function isPlainTextDocument(doc) {
    return TEXT_TYPES.includes(doc.contentType);
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { isMarkdownPath, isMarkdownUrl, isPlainTextDocument });
})();
