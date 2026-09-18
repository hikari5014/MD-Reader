// 轉換器 + 消毒器:Markdown 文字 → 安全的 HTML,再做排版後加工
// 需要先載入 vendor/(markdown-it、外掛、purify、highlight、katex、js-yaml)與 core/syntax.js、core/obsidian.js
(() => {
  const md = globalThis.markdownit({
    html: true,
    linkify: true,
    highlight(code, lang) {
      const hljs = globalThis.hljs;
      if (!lang || !hljs.getLanguage(lang)) return ''; // 空字串 = 交給 markdown-it 原樣跳脫(mermaid 也走這裡,之後另外畫)
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    },
  })
    .use(globalThis.markdownitMark) // ==螢光筆==
    .use(globalThis.markdownitFootnote) // 腳註[^1]
    .use(MDR.syntaxPlugin); // [[連結]]、![[嵌入]]、$數學$

  function renderMarkdown(text) {
    return globalThis.DOMPurify.sanitize(md.render(MDR.stripComments(text)));
  }

  // 標題 → 錨點 id(目錄、#連結、[[筆記#段落]] 共用同一套規則)
  const slugify = (text) => text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';

  // 排版後的加工(都在消毒之後,只移動既有節點或加入我們自己產生的元素)
  function enhance(article, settings = MDR.DEFAULTS) {
    MDR.callouts(article);
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
    const used = new Set();
    article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      const base = slugify(h.textContent);
      let id = base;
      for (let i = 1; used.has(id); i++) id = `${base}-${i}`;
      used.add(id);
      h.id = id;
    });
    MDR.blockIds(article);
    MDR.tags(article);
    article.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    MDR.linkWikilinks(article, settings.obsidianVault);
    MDR.resolveEmbeds(article);
  }

  function titleOf(text, fallback) {
    const m = text.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : fallback;
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { renderMarkdown, enhance, slugify, titleOf });
})();
