// 首頁:四個入口(選檔、貼上、網址、Google Drive)+ 最近開過
(async () => {
  const $ = (id) => document.getElementById(id);
  const KIND = {
    file: { icon: 'description', label: '手機檔案' },
    text: { icon: 'content_paste', label: '貼上' },
    web: { icon: 'language', label: '網路' },
    drive: { icon: 'cloud', label: 'Google Drive' },
  };
  const MAX_SIZE = 5 * 1024 * 1024;

  const settings = await MDR.loadSettings();
  MDR.applySettings(document, settings);
  MDR.onSettingsChanged((s) => MDR.applySettings(document, s));
  await MDR.markUpdateSeen(); // 手機版沒有「新版本小紅點」
  MDR.enableRipple(document.body);
  MDR.enableTouch(document.body);
  $('version').textContent = `MD隨手讀 手機版 v${MDR_PWA.VERSION}`;

  const pasteSheet = PWA.sheet($('paste-sheet'));
  const urlSheet = PWA.sheet($('url-sheet'));
  const driveSheet = PWA.sheet($('drive-sheet'));
  const settingsSheet = PWA.sheet($('settings-sheet'));

  // 存進文件庫 → 到閱讀頁
  async function openText(doc) {
    const id = await PWA.saveDoc(doc);
    location.assign(PWA.readUrl(id));
  }
  // 貼上的文字沒有檔名:用第一個標題或第一行當名字
  function nameFromText(text) {
    const line = text.split('\n').map((l) => l.trim()).find((l) => l && l !== '---') || '貼上的文字';
    return line.replace(/^#+\s*/, '').slice(0, 40);
  }
  const relTime = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '剛剛';
    if (m < 60) return `${m} 分鐘前`;
    if (m < 1440) return `${Math.round(m / 60)} 小時前`;
    return new Date(t).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
  };

  // ---------- 加到主畫面的提示(iPhone/iPad 的 Safari,還沒加到主畫面時)----------
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installDismissed = false;
  try { installDismissed = localStorage.getItem('mdr-install-dismissed') === '1'; } catch { /* 無痕模式 */ }
  $('install').hidden = !(ios && !standalone && !installDismissed);
  $('install-close').onclick = () => {
    $('install').hidden = true;
    try { localStorage.setItem('mdr-install-dismissed', '1'); } catch { /* 無痕模式 */ }
  };

  // ---------- 最近開過 ----------
  async function renderRecent() {
    const docs = await PWA.listDocs();
    $('recent-empty').hidden = docs.length > 0;
    $('recent').replaceChildren(...docs.map((d, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--i', String(Math.min(i, 6)));
      const a = document.createElement('a');
      a.className = 'pwa-row mdr-ix';
      a.href = PWA.readUrl(d.id);
      const icon = document.createElement('span');
      icon.className = 'pwa-row-icon';
      icon.append(MDR.icon(KIND[d.kind]?.icon || 'description'));
      const text = document.createElement('span');
      text.className = 'pwa-row-text';
      const title = document.createElement('span');
      title.textContent = d.name;
      const meta = document.createElement('small');
      meta.textContent = `${relTime(d.time)} · ${KIND[d.kind]?.label || ''}`;
      text.append(title, meta);
      const arrow = MDR.icon('chevron_right');
      arrow.classList.add('pwa-row-arrow');
      a.append(icon, text, arrow);
      li.append(a);
      return li;
    }));
  }
  renderRecent();
  // 從閱讀頁按返回(瀏覽器保留舊畫面)時重新整理清單
  addEventListener('pageshow', (e) => { if (e.persisted) renderRecent(); });

  // ---------- 選擇檔案 ----------
  // 不加 accept 篩選:iPhone 會把 .md 變成灰色不能選
  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // 同一個檔可以再選一次
    if (!file) return; // 使用者取消
    if (file.size > MAX_SIZE) return PWA.toast('檔案太大(超過 5MB),可能不是 Markdown 檔', 'error');
    const text = await file.text();
    if (!PWA.looksLikeText(text)) return PWA.toast(`「${file.name}」不是文字檔,請選 .md 檔`, 'error', 3000);
    openText({ name: file.name, text, kind: 'file' });
  });

  // ---------- 貼上文字 ----------
  $('paste-btn').onclick = () => { pasteSheet.open(); setTimeout(() => $('paste-text').focus(), 350); };
  $('paste-clip').onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return PWA.toast('剪貼簿是空的', 'warning');
      $('paste-text').value = t;
    } catch {
      PWA.toast('沒辦法讀剪貼簿,請在上面的框框長按 →「貼上」', 'warning', 3000);
    }
  };
  $('paste-go').onclick = () => {
    const parsed = MDR.parsePasted($('paste-text').value);
    if (!parsed.src && !parsed.text) return PWA.toast('還沒有貼上內容', 'warning');
    if (parsed.src) { // 整段只有一個網址 → 當網址開
      pasteSheet.close();
      $('url-input').value = parsed.src;
      return openUrl($('url-go'));
    }
    openText({ name: nameFromText(parsed.text), text: parsed.text, kind: 'text' });
  };

  // ---------- 輸入網址 ----------
  $('url-btn').onclick = () => { urlSheet.open(); setTimeout(() => $('url-input').focus(), 350); };
  $('url-form').addEventListener('submit', (e) => { e.preventDefault(); openUrl($('url-go')); });
  async function fetchMarkdown(raw) {
    const url = MDR.toRawUrl(raw.trim());
    if (!/^https?:\/\//i.test(url)) throw new Error('網址要以 https:// 開頭');
    const res = await fetch(url).catch(() => {
      throw new Error('讀不到這個網址:對方網站沒有開放讀取,或網路不通。可以下載到手機後用「選擇檔案」');
    });
    if (!res.ok) throw new Error(`網站回應 ${res.status}(找不到檔案或沒有權限)`);
    if ((res.headers.get('content-type') || '').startsWith('text/html')) throw new Error('這個網址打開是一般網頁,不是 Markdown 檔');
    const text = await res.text();
    if (!PWA.looksLikeText(text)) throw new Error('這個網址不是文字檔');
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname);
    return { name, text, kind: 'web', src: url };
  }
  async function openUrl(button) {
    try {
      const doc = await MDR.withLoader(() => fetchMarkdown($('url-input').value), () => button.classList.add('is-busy'), () => button.classList.remove('is-busy'));
      await openText(doc);
    } catch (err) {
      button.classList.remove('is-busy');
      PWA.toast(err.message, 'error', 4000);
    }
  }

  // ---------- Google Drive ----------
  let driveSearch = '';
  let driveNext = '';
  function driveMessage(icon, html, action) {
    const box = document.createElement('div');
    box.className = 'pwa-drive-msg';
    const p = document.createElement('div');
    p.innerHTML = html; // 只放本檔寫死的說明文字
    box.append(MDR.icon(icon), p);
    if (action) box.append(action);
    $('drive-body').replaceChildren(box);
  }
  function button(icon, label, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${cls} mdr-ix`;
    b.append(MDR.icon(icon), label);
    b.onclick = onClick;
    return b;
  }
  function renderDriveLogin() {
    if (!PWA_DRIVE.configured()) {
      return driveMessage('info', '<b>還沒設定 Google 登入</b><br>要先到 Google Cloud 申請一組「OAuth 用戶端 ID」,填進網站設定。步驟見專案的 <code>docs/guide/PWA-GOOGLE-DRIVE.md</code>。<br><br>在那之前,可以先在 iPhone 裝 Google Drive App,再用首頁的「選擇檔案」→ 左上角「瀏覽」→ Google Drive 挑檔。');
    }
    driveMessage('cloud', '<b>登入 Google,挑雲端硬碟裡的 .md</b><br>只會要求「讀取」權限;登入狀態 1 小時後失效,只存在這支手機。', button('login', '用 Google 帳號登入', 'mdr-btn-primary', () => PWA_DRIVE.signIn()));
  }
  async function renderDriveList(more = false) {
    const body = $('drive-body');
    if (!more) {
      body.replaceChildren();
      const form = document.createElement('form');
      form.className = 'pwa-drive-search';
      const input = document.createElement('input');
      input.className = 'pwa-input';
      input.type = 'search';
      input.placeholder = '搜尋檔名';
      input.value = driveSearch;
      input.id = 'drive-search';
      const go = button('search', '', 'mdr-icon-btn', null);
      go.type = 'submit';
      go.setAttribute('aria-label', '搜尋');
      form.append(input, go);
      form.onsubmit = (e) => { e.preventDefault(); driveSearch = input.value; renderDriveList(); };
      const ul = document.createElement('ul');
      ul.className = 'pwa-list';
      ul.id = 'drive-list';
      const foot = document.createElement('div');
      foot.className = 'pwa-row-actions';
      foot.id = 'drive-foot';
      foot.append(button('logout', '登出', 'mdr-btn-text', async () => { await PWA_DRIVE.signOut(); renderDriveLogin(); }));
      body.append(form, ul, foot);
    }
    const ul = $('drive-list');
    const loading = document.createElement('li');
    loading.className = 'pwa-loading';
    loading.append(MDR.spinner(22), '讀取中…');
    ul.append(loading);
    try {
      const { files, next } = await PWA_DRIVE.list(driveSearch, more ? driveNext : '');
      driveNext = next;
      loading.remove();
      ul.querySelector('.pwa-more')?.remove();
      for (const f of files) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pwa-row mdr-ix';
        b.innerHTML = '<span class="pwa-row-icon"></span><span class="pwa-row-text"><span></span><small></small></span>';
        b.querySelector('.pwa-row-icon').append(MDR.icon('description'));
        b.querySelector('.pwa-row-text span').textContent = f.name;
        b.querySelector('small').textContent = `修改於 ${relTime(new Date(f.modifiedTime).getTime())}`;
        b.onclick = () => openDriveFile(f, b);
        li.append(b);
        ul.append(li);
      }
      if (!ul.querySelector('.pwa-row') ) {
        const li = document.createElement('li');
        li.className = 'pwa-empty';
        li.textContent = driveSearch ? `找不到檔名含「${driveSearch}」的 .md` : '雲端硬碟裡沒有找到 .md 檔';
        ul.append(li);
      }
      if (next) {
        const li = document.createElement('li');
        li.className = 'pwa-more';
        li.append(button('expand_more', '載入更多', 'mdr-btn-text', () => renderDriveList(true)));
        ul.append(li);
      }
    } catch (err) {
      loading.remove();
      if (err.code === 'auth') return renderDriveLogin();
      PWA.toast(err.message, 'error', 3000);
    }
  }
  async function openDriveFile(f, row) {
    row.classList.add('is-busy');
    try {
      const text = await PWA_DRIVE.download(f.id);
      await openText({ name: f.name, text, kind: 'drive', src: `drive:${f.id}` });
    } catch (err) {
      row.classList.remove('is-busy');
      if (err.code === 'auth') return renderDriveLogin();
      PWA.toast(err.message, 'error', 3000);
    }
  }
  const openDrive = () => {
    driveSheet.open();
    if (PWA_DRIVE.configured() && PWA_DRIVE.signedIn()) renderDriveList();
    else renderDriveLogin();
  };
  $('drive-btn').onclick = openDrive;
  const back = PWA_DRIVE.handleRedirect(); // 從 Google 登入頁回來
  if (back === 'ok') openDrive();
  if (back === 'error') PWA.toast('Google 登入沒有完成', 'error', 3000);

  // ---------- 設定 ----------
  $('settings-btn').onclick = () => settingsSheet.open();
  $('settings-sheet').addEventListener('sheet-open', async () => {
    const s = await MDR.loadSettings();
    requestAnimationFrame(() => PWA.segment($('home-theme'), s.theme, (theme) => MDR.saveSettings({ theme })));
  });
  $('clear-btn').onclick = async () => {
    if (!confirm('清除最近開過的文件?(存在手機裡的內容也會一起刪除)')) return;
    await PWA.clearDocs();
    await renderRecent();
    settingsSheet.close();
    PWA.toast('已清除');
  };
})();
