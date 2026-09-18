// 閱讀畫面:把排版好的文件裝進「目錄 + 內文 + 右上工具列」的外殼
// 就地排版(content script)與閱讀頁(viewer)共用
(() => {
  const WIDE = '(min-width: 1100px)'; // 夠寬才把目錄常駐在左邊,窄螢幕改成浮動抽屜
  const THEME_ORDER = ['system', 'light', 'dark', 'sepia'];
  const THEME_LABEL = { system: '跟隨系統', light: '淺色', dark: '深色', sepia: '護眼' };
  // 工具列圖示(Google Material Symbols);主題按鈕的圖示跟著目前主題變
  const ICONS = { toc: 'toc', raw: 'code', print: 'print', settings: 'settings' };
  const THEME_ICON = { system: 'brightness_auto', light: 'light_mode', dark: 'dark_mode', sepia: 'eyeglasses' };

  async function mount(doc, text, fallbackTitle) {
    const settings = await MDR.loadSettings();
    const html = doc.documentElement;
    html.dataset.mdr = 'rendered';
    const { body, raw: frontmatter } = MDR.splitFrontmatter(text);
    const parsed = frontmatter === null ? null : MDR.parseFrontmatter(frontmatter);
    const props = parsed?.data;
    doc.title = MDR.titleOf(body, typeof props?.title === 'string' ? props.title : fallbackTitle);

    const article = doc.createElement('article');
    article.className = 'mdr-body';
    article.innerHTML = MDR.renderMarkdown(body);
    MDR.enhance(article, settings);
    const propsPanel = frontmatter === null ? null : MDR.buildProperties(parsed, frontmatter);
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
    const progress = doc.createElement('div');
    progress.className = 'mdr-progress';
    progress.append(doc.createElement('span'));
    shell.append(page, buildToolbar(doc, { article, raw, shell, hasToc: !!toc }), progress);
    doc.body.replaceChildren(shell);
    markUpdate(shell);

    let current = settings;
    let diagramsDark = null;
    const wide = globalThis.matchMedia(WIDE);
    const systemDark = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const apply = (s) => {
      current = s;
      MDR.applySettings(doc, s);
      shell.dataset.toc = toc && s.toc && wide.matches ? 'open' : 'closed';
      const btn = shell.querySelector('[data-action="theme"]');
      btn.dataset.tip = `主題:${THEME_LABEL[s.theme]}(點一下切換)`;
      btn.setAttribute('aria-label', btn.dataset.tip);
      const themeIcon = btn.querySelector('.mdr-icon');
      if (themeIcon.dataset.icon !== THEME_ICON[s.theme]) {
        themeIcon.dataset.icon = THEME_ICON[s.theme];
        themeIcon.classList.remove('is-spinning');
        void themeIcon.offsetWidth; // 重新觸發「轉一圈出現」動畫
        themeIcon.classList.add('is-spinning');
      }
      if (propsPanel) propsPanel.hidden = !s.showProperties;
      progress.hidden = !s.progressBar;
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
      if (action === 'theme') MDR.saveSettings({ theme: THEME_ORDER[(THEME_ORDER.indexOf(current.theme) + 1) % THEME_ORDER.length] });
      if (action === 'toc') {
        if (wide.matches) MDR.saveSettings({ toc: shell.dataset.toc !== 'open' }); // 寬螢幕:記住偏好
        else shell.dataset.toc = shell.dataset.toc === 'open' ? 'closed' : 'open'; // 窄螢幕:只開這一次
      }
    });
    if (toc) watchScroll(doc, article, toc);
    watchProgress(doc, progress.firstChild);
  }

  // 插件更新後還沒看過更新日誌:⚙️ 加小紅點,點了直接到更新日誌
  async function markUpdate(shell) {
    if (!(await MDR.hasUnseenUpdate())) return;
    const btn = shell.querySelector('[data-action="settings"]');
    btn.classList.add('has-update');
    btn.dataset.tip = '有新版本!點我看更新日誌';
  }

  // 頂端進度條:讀到哪裡
  function watchProgress(doc, bar) {
    const update = () => {
      const max = doc.documentElement.scrollHeight - globalThis.innerHeight;
      bar.style.width = `${max > 0 ? Math.min(100, (globalThis.scrollY / max) * 100) : 100}%`;
    };
    doc.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    globalThis.addEventListener('resize', update);
    update();
  }

  function buildToolbar(doc, { article, raw, shell, hasToc }) {
    const bar = doc.createElement('div');
    bar.className = 'mdr-toolbar';
    const buttons = [
      hasToc && ['toc', '目錄'],
      ['theme', '主題'],
      ['raw', '原始碼'],
      ['print', '列印 / 存成 PDF'],
      ['settings', '設定'],
    ].filter(Boolean);
    for (const [action, title] of buttons) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'mdr-ix';
      b.dataset.action = action;
      b.dataset.tip = title;
      b.setAttribute('aria-label', title);
      b.append(MDR.icon(ICONS[action] || THEME_ICON.system, doc));
      bar.append(b);
    }
    MDR.enableRipple(bar);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const action = b.dataset.action;
      if (action === 'raw') {
        raw.hidden = !raw.hidden;
        article.hidden = !raw.hidden;
        b.classList.toggle('is-on', !raw.hidden);
        b.dataset.tip = raw.hidden ? '原始碼' : '回到排版畫面';
        b.setAttribute('aria-label', b.dataset.tip);
        b.querySelector('.mdr-icon').dataset.icon = raw.hidden ? 'code' : 'article';
      } else if (action === 'print') {
        globalThis.print();
      } else if (action === 'settings') {
        chrome.runtime.sendMessage({ type: 'open-options', tab: b.classList.contains('has-update') ? 'changelog' : '' });
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
