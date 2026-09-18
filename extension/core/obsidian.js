// Obsidian 語法(排版後加工):提示框、#標籤、^區塊 ID、雙中括號連結網址、嵌入圖片、屬性表
// 全部在 DOMPurify 消毒之後執行,只移動既有節點或用 textContent 建立新節點
(() => {
  const svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  // 提示框類型 → 圖示(與 Obsidian 相同的 Lucide 圖示)
  const ICONS = {
    note: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    abstract: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    todo: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    tip: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    success: svg('<path d="M20 6 9 17l-5-5"/>'),
    question: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>'),
    warning: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>'),
    failure: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    danger: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
    bug: svg('<rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>'),
    example: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    quote: svg('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 0-1 1v3c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'),
  };
  const ALIASES = { summary: 'abstract', tldr: 'abstract', hint: 'tip', important: 'tip', check: 'success', done: 'success', help: 'question', faq: 'question', caution: 'warning', attention: 'warning', fail: 'failure', missing: 'failure', error: 'danger', cite: 'quote' };

  // 取出段落第一行(到換行為止)當標題
  function takeFirstLine(p) {
    const frag = document.createDocumentFragment();
    while (p.firstChild) {
      const n = p.firstChild;
      if (n.nodeName === 'BR') { n.remove(); break; }
      if (n.nodeType === Node.TEXT_NODE && n.textContent.includes('\n')) {
        const i = n.textContent.indexOf('\n');
        frag.append(n.textContent.slice(0, i));
        n.textContent = n.textContent.slice(i + 1);
        break;
      }
      frag.append(n);
    }
    return frag;
  }

  // > [!type]± 標題 → 提示框(- 預設收起、+ 預設展開;可巢狀)
  function callouts(root) {
    root.querySelectorAll('blockquote').forEach((bq) => {
      const p = bq.firstElementChild;
      const first = p?.tagName === 'P' ? p.firstChild : null;
      const m = first?.nodeType === Node.TEXT_NODE && first.textContent.match(/^\[!([\w-]+)\]([+-]?)[ \t]*/);
      if (!m) return;
      first.textContent = first.textContent.slice(m[0].length);
      const raw = m[1].toLowerCase();
      const type = ALIASES[raw] || raw;
      const fold = m[2];
      const titleText = takeFirstLine(p);
      if (!p.textContent.trim() && !p.querySelector('img')) p.remove();

      const box = document.createElement(fold ? 'details' : 'div');
      box.className = 'callout';
      box.dataset.callout = type;
      if (fold === '+') box.open = true;
      const title = document.createElement(fold ? 'summary' : 'div');
      title.className = 'callout-title';
      const icon = document.createElement('span');
      icon.className = 'callout-icon';
      icon.innerHTML = ICONS[type] || ICONS.note;
      const label = document.createElement('span');
      label.className = 'callout-title-inner';
      if (titleText.textContent.trim()) label.append(titleText);
      else label.textContent = raw[0].toUpperCase() + raw.slice(1); // 沒寫標題:用類型名稱,和 Obsidian 一樣
      title.append(icon, label);
      box.append(title);
      if ([...bq.childNodes].some((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent.trim())) {
        const content = document.createElement('div');
        content.className = 'callout-content';
        content.append(...bq.childNodes);
        box.append(content);
      }
      bq.replaceWith(box);
    });
  }

  // 文字裡的 #標籤 → 標籤膠囊(程式碼、連結、公式裡的不動)
  const TAG = /(^|[\s(（「])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
  function tags(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('code, pre, a, kbd, .mdr-tag, .katex, .mdr-mermaid, .callout-icon') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.includes('#')) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const s = n.textContent;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of s.matchAll(TAG)) {
        const start = m.index + m[1].length;
        frag.append(s.slice(last, start));
        const tag = document.createElement('span');
        tag.className = 'mdr-tag';
        tag.textContent = `#${m[2]}`;
        frag.append(tag);
        last = start + 1 + m[2].length;
      }
      if (!last) continue;
      frag.append(s.slice(last));
      n.replaceWith(frag);
    }
  }

  // 段落結尾的 ^區塊ID:隱藏,並讓 [[#^ID]] 跳得過來
  function blockIds(root) {
    root.querySelectorAll('p, li').forEach((el) => {
      const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).pop();
      const m = text?.textContent.match(/\s\^([A-Za-z0-9-]+)\s*$/);
      if (!m) return;
      text.textContent = text.textContent.slice(0, m.index);
      if (!el.id) el.id = `^${m[1]}`;
    });
  }

  // [[筆記]] 的網址:有填保險庫名稱 → 用 Obsidian App 打開;沒填 → 同資料夾的「筆記.md」
  function linkWikilinks(root, vault) {
    root.querySelectorAll('a.internal-link[data-href]').forEach((a) => {
      const [page, sub] = MDR.splitTarget(a.dataset.href);
      const anchor = sub ? `#${sub.startsWith('^') ? encodeURIComponent(sub) : encodeURIComponent(MDR.slugify(sub))}` : '';
      if (!page) a.href = anchor || '#';
      else if (vault) a.href = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(page)}`;
      else a.href = encodeURI(/\.[a-z0-9]{1,5}$/i.test(page) ? page : `${page}.md`) + anchor;
    });
  }

  // ![[圖.png]]:Obsidian 只寫檔名,不寫資料夾 → 依序到附近常見的附件資料夾找
  const ATTACH_DIRS = ['', '_attachments/', 'attachments/', 'assets/', 'images/'];
  function resolveEmbeds(root) {
    const local = document.baseURI.startsWith('file:');
    root.querySelectorAll('img.mdr-embed-img[data-embed]').forEach((img) => {
      const name = encodeURI(img.dataset.embed);
      const tries = !local || name.includes('/') ? [name]
        : [0, 1, 2, 3].flatMap((up) => ATTACH_DIRS.map((dir) => '../'.repeat(up) + dir + name));
      let i = 0;
      img.addEventListener('error', () => {
        if (++i < tries.length) { img.src = tries[i]; return; }
        const miss = document.createElement('span');
        miss.className = 'mdr-embed-missing';
        miss.textContent = `🖼 找不到圖片:${img.dataset.embed}`;
        img.replaceWith(miss);
      });
      img.src = tries[0];
    });
  }

  // 屬性表(frontmatter)
  function valueNode(value) {
    if (value === null || value === undefined || value === '') {
      const empty = document.createElement('span');
      empty.className = 'mdr-prop-empty';
      empty.textContent = '—';
      return empty;
    }
    if (Array.isArray(value)) {
      const list = document.createElement('span');
      list.className = 'mdr-prop-list';
      for (const item of value) {
        const pill = document.createElement('span');
        pill.className = 'mdr-prop-pill';
        pill.append(valueNode(item));
        list.append(pill);
      }
      return list;
    }
    if (typeof value === 'boolean') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.disabled = true;
      box.checked = value;
      return box;
    }
    if (typeof value === 'object') return document.createTextNode(JSON.stringify(value));
    const s = String(value);
    if (/^https?:\/\/\S+$/.test(s)) {
      const a = document.createElement('a');
      a.href = s;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s;
      return a;
    }
    // 字串裡的 [[連結]]
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      frag.append(s.slice(last, m.index));
      const a = document.createElement('a');
      a.className = 'internal-link';
      a.dataset.href = m[1].trim();
      a.textContent = (m[2] || MDR.displayOf(m[1].trim())).trim();
      frag.append(a);
      last = m.index + m[0].length;
    }
    frag.append(s.slice(last));
    return frag;
  }

  function buildProperties(data, raw) {
    const box = document.createElement('details');
    box.className = 'mdr-props';
    box.open = true;
    const summary = document.createElement('summary');
    summary.textContent = '屬性';
    box.append(summary);
    const grid = document.createElement('div');
    grid.className = 'mdr-props-grid';
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        const k = document.createElement('div');
        k.className = 'mdr-prop-key';
        k.textContent = key;
        const v = document.createElement('div');
        v.className = 'mdr-prop-value';
        v.append(valueNode(value));
        grid.append(k, v);
      }
    } else {
      const pre = document.createElement('pre');
      pre.className = 'mdr-props-raw';
      pre.textContent = raw; // 屬性格式有誤時顯示原文
      grid.append(pre);
    }
    box.append(grid);
    return box;
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { callouts, tags, blockIds, linkWikilinks, resolveEmbeds, buildProperties });
})();
