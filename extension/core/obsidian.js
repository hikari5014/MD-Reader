// Obsidian 語法(排版後加工):提示框、#標籤、^區塊 ID、雙中括號連結網址、嵌入圖片、屬性表
// 全部在 DOMPurify 消毒之後執行,只移動既有節點或用 textContent 建立新節點
(() => {
  // 提示框類型 → Google Material Symbols 圖示
  const ICONS = {
    note: 'edit', abstract: 'summarize', info: 'info', todo: 'check_circle', tip: 'local_fire_department',
    success: 'check', question: 'help', warning: 'warning', failure: 'close', danger: 'bolt',
    bug: 'bug_report', example: 'list', quote: 'format_quote',
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
      const icon = MDR.icon(ICONS[type] || ICONS.note);
      icon.classList.add('callout-icon');
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
      acceptNode: (n) => (n.parentElement.closest('code, pre, a, kbd, .mdr-tag, .katex, .mdr-mermaid, .mdr-icon') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
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
      else {
        // 一律當成相對路徑:筆記名稱長得像「javascript:…」也不能變成可執行的網址
        const file = /\.[a-z0-9]{1,5}$/i.test(page) ? page : `${page}.md`;
        a.href = (/^[a-z][a-z0-9+.-]*:/i.test(file) ? './' : '') + encodeURI(file) + anchor;
      }
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
        miss.append(MDR.icon('broken_image'), `找不到圖片:${img.dataset.embed}`);
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
    if (typeof value === 'object') { // 巢狀屬性:排成「名稱:值」,裡面的 [[連結]] 照樣能點
      const obj = document.createElement('span');
      obj.className = 'mdr-prop-obj';
      for (const [k, v] of Object.entries(value)) {
        const row = document.createElement('span');
        const key = document.createElement('span');
        key.className = 'mdr-prop-obj-key';
        key.textContent = `${k}:`;
        row.append(key, valueNode(v));
        obj.append(row);
      }
      return obj;
    }
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

  // parsed:parseFrontmatter 的結果({ data, strict })或 null(完全讀不懂)
  function buildProperties(parsed, raw) {
    const data = parsed?.data;
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
    if (parsed && !parsed.strict) {
      const note = document.createElement('div');
      note.className = 'mdr-props-note';
      note.textContent = '⚠️ 屬性格式不標準(Obsidian 會顯示「屬性無效」),已盡量讀出來。常見原因:同一行放了好幾個雙中括號連結,要改成一行一個的清單,或整串加上引號';
      box.append(note);
    }
    return box;
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { callouts, tags, blockIds, linkWikilinks, resolveEmbeds, buildProperties });
})();
