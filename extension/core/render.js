// 轉換器 + 消毒器:Markdown 文字 → 安全的 HTML,再補上任務勾選框與標題錨點
// 需要先載入 vendor/markdown-it.min.js、vendor/purify.min.js、vendor/highlight.min.js
(() => {
  const md = globalThis.markdownit({
    html: true,
    linkify: true,
    highlight(code, lang) {
      const hljs = globalThis.hljs;
      if (!lang || !hljs.getLanguage(lang)) return ''; // 空字串 = 交給 markdown-it 原樣跳脫
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    },
  });

  function renderMarkdown(text) {
    return globalThis.DOMPurify.sanitize(md.render(text));
  }

  // 排版後的加工(都在消毒之後,只加我們自己產生的元素)
  function enhance(article) {
    // - [ ] / - [x] → 勾選框
    article.querySelectorAll('li').forEach((li) => {
      const host = li.firstElementChild?.tagName === 'P' ? li.firstElementChild : li;
      const first = host.firstChild;
      const m = first?.nodeType === Node.TEXT_NODE && first.textContent.match(/^\[([ xX])\]\s/);
      if (!m) return;
      first.textContent = first.textContent.slice(m[0].length);
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.disabled = true;
      box.checked = m[1] !== ' ';
      host.prepend(box);
      li.classList.add('mdr-task');
      li.parentElement.classList.add('mdr-task-list');
    });
    // 標題加上錨點 id,讓目錄與文件內的 #連結 可以跳
    const used = new Set();
    article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      const base = h.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';
      let id = base;
      for (let i = 1; used.has(id); i++) id = `${base}-${i}`;
      used.add(id);
      h.id = id;
    });
    // 外部連結開新分頁
    article.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  function titleOf(text, fallback) {
    const m = text.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : fallback;
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { renderMarkdown, enhance, titleOf });
})();
