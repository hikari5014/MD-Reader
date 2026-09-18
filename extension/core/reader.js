// 閱讀畫面:把排版好的文件裝進「目錄 + 內文 + 右上工具列」的外殼
// 就地排版(content script)與閱讀頁(viewer)共用
(() => {
  const WIDE = '(min-width: 1100px)'; // 夠寬才把目錄常駐在左邊,窄螢幕改成浮動抽屜
  const THEME_ORDER = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: '跟隨系統', light: '淺色', dark: '深色' };
  const svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICONS = {
    toc: svg('<path d="M3 6h18M3 12h12M3 18h15"/>'),
    theme: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
    raw: svg('<path d="m8 6-6 6 6 6M16 6l6 6-6 6"/>'),
    settings: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  };

  async function mount(doc, text, fallbackTitle) {
    const settings = await MDR.loadSettings();
    const html = doc.documentElement;
    html.dataset.mdr = 'rendered';
    const { body, raw: frontmatter } = MDR.splitFrontmatter(text);
    const props = frontmatter === null ? null : MDR.parseFrontmatter(frontmatter);
    doc.title = MDR.titleOf(body, typeof props?.title === 'string' ? props.title : fallbackTitle);

    const article = doc.createElement('article');
    article.className = 'mdr-body';
    article.innerHTML = MDR.renderMarkdown(body);
    MDR.enhance(article, settings);
    const propsPanel = frontmatter === null ? null : MDR.buildProperties(props, frontmatter);
    if (propsPanel) article.prepend(propsPanel);

    const raw = doc.createElement('pre');
    raw.className = 'mdr-raw';
    raw.hidden = true;
    raw.textContent = text;

    const page = doc.createElement('main');
    page.className = 'mdr-page';
    page.append(article, raw);

    const shell = doc.createElement('div');
    shell.className = 'mdr-shell';
    const toc = buildToc(doc, article);
    if (toc) shell.append(toc);
    shell.append(page, buildToolbar(doc, { article, raw, shell, hasToc: !!toc }));
    doc.body.replaceChildren(shell);

    let current = settings;
    let diagramsDark = null;
    const wide = globalThis.matchMedia(WIDE);
    const systemDark = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const apply = (s) => {
      current = s;
      MDR.applySettings(doc, s);
      shell.dataset.toc = toc && s.toc && wide.matches ? 'open' : 'closed';
      const btn = shell.querySelector('[data-action="theme"]');
      btn.title = `主題:${THEME_LABEL[s.theme]}(點一下切換)`;
      if (propsPanel) propsPanel.hidden = !s.showProperties;
      MDR.linkWikilinks(article, s.obsidianVault);
      // 流程圖的配色跟著深淺色走,變了才重畫
      const dark = s.theme === 'dark' || (s.theme === 'system' && systemDark.matches);
      if (dark !== diagramsDark) {
        diagramsDark = dark;
        MDR.renderDiagrams(article, dark);
      }
    };
    apply(settings);
    MDR.onSettingsChanged(apply);
    wide.addEventListener('change', () => apply(current));
    systemDark.addEventListener('change', () => apply(current));
    shell.addEventListener('mdr-action', async (e) => {
      const action = e.detail;
      if (action === 'theme') MDR.saveSettings({ theme: THEME_ORDER[(THEME_ORDER.indexOf(current.theme) + 1) % 3] });
      if (action === 'toc') {
        if (wide.matches) MDR.saveSettings({ toc: shell.dataset.toc !== 'open' }); // 寬螢幕:記住偏好
        else shell.dataset.toc = shell.dataset.toc === 'open' ? 'closed' : 'open'; // 窄螢幕:只開這一次
      }
    });
    if (toc) watchScroll(doc, article, toc);
  }

  function buildToolbar(doc, { article, raw, shell, hasToc }) {
    const bar = doc.createElement('div');
    bar.className = 'mdr-toolbar';
    const buttons = [
      hasToc && ['toc', '目錄'],
      ['theme', '主題'],
      ['raw', '原始碼'],
      ['settings', '設定'],
    ].filter(Boolean);
    for (const [action, title] of buttons) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.dataset.action = action;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.innerHTML = ICONS[action];
      bar.append(b);
    }
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const action = b.dataset.action;
      if (action === 'raw') {
        raw.hidden = !raw.hidden;
        article.hidden = !raw.hidden;
        b.classList.toggle('is-on', !raw.hidden);
        b.title = raw.hidden ? '原始碼' : '回到排版畫面';
      } else if (action === 'settings') {
        chrome.runtime.sendMessage({ type: 'open-options' });
      } else {
        shell.dispatchEvent(new CustomEvent('mdr-action', { detail: action }));
      }
    });
    return bar;
  }

  function buildToc(doc, article) {
    const heads = [...article.querySelectorAll('h1, h2, h3, h4')];
    if (heads.length < 2) return null;
    const top = Math.min(...heads.map((h) => Number(h.tagName[1])));
    const nav = doc.createElement('nav');
    nav.className = 'mdr-toc';
    nav.setAttribute('aria-label', '目錄');
    const title = doc.createElement('div');
    title.className = 'mdr-toc-title';
    title.textContent = '目錄';
    nav.append(title);
    for (const h of heads) {
      const a = doc.createElement('a');
      a.href = `#${encodeURIComponent(h.id)}`;
      a.textContent = h.textContent;
      a.dataset.target = h.id;
      a.dataset.level = String(Number(h.tagName[1]) - top);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', a.href);
        if (!globalThis.matchMedia(WIDE).matches) nav.parentElement.dataset.toc = 'closed';
      });
      nav.append(a);
    }
    return nav;
  }

  // 捲動時,目錄標出目前讀到的段落
  function watchScroll(doc, article, toc) {
    const heads = [...article.querySelectorAll('h1, h2, h3, h4')];
    const links = new Map([...toc.querySelectorAll('a')].map((a) => [a.dataset.target, a]));
    let ticking = false;
    const update = () => {
      ticking = false;
      let current = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top <= 90) current = h;
      links.forEach((a, id) => a.classList.toggle('is-active', id === current.id));
    };
    doc.addEventListener('scroll', () => {
      if (!ticking) requestAnimationFrame(update);
      ticking = true;
    }, { passive: true });
    update();
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { mount });
})();
