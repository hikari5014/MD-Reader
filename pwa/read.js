// 閱讀頁:read.html?doc=<文件編號>。排版交給引擎的 MDR.mount,這裡只加手機版的返回鍵、閱讀設定面板、分享
(async () => {
  const id = new URLSearchParams(location.search).get('doc');
  MDR.applySettings(document, await MDR.loadSettings());
  await MDR.markUpdateSeen(); // 手機版沒有「新版本小紅點」
  let doc = null;
  try {
    await MDR.withLoader(async () => {
      doc = await MDR.loadDoc(id);
      if (!doc) throw new Error('這份文件已經不在手機裡了(可能被清除,或超過最近 30 份),請重新開啟');
      await MDR.mount(document, doc.text, doc.name);
    }, () => MDR.pageLoader.show('正在開啟文件…'), () => MDR.pageLoader.hide());
  } catch (e) {
    showError(e.message);
    return;
  }
  document.body.append(backButton(), buildSheet(doc));
  MDR.enableRipple(document.body);
  MDR.enableTouch(document.body);
  blockSiblingLinks();

  function backButton() {
    const b = document.createElement('a');
    b.className = 'pwa-back mdr-ix';
    b.href = './';
    b.setAttribute('aria-label', '回首頁');
    b.dataset.tip = '回首頁';
    b.dataset.tipPos = 'left';
    b.append(MDR.icon('arrow_back'));
    return b;
  }

  // 文件裡連到同資料夾其他筆記的連結:手機網頁碰不到其他檔案,點了說明原因而不是跳到錯誤頁
  function blockSiblingLinks() {
    document.querySelector('.mdr-body')?.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.getAttribute('href').startsWith('#')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return; // 外部網站、obsidian:// 照常開
      e.preventDefault();
      PWA.toast('手機版打不開同資料夾的其他筆記。裝了 Obsidian 的話,可在設定填「保險庫名稱」改用 Obsidian 開', 'info', 4000);
    });
  }

  function showError(message) {
    const box = document.createElement('div');
    box.className = 'mdr-error';
    const msg = document.createElement('p');
    msg.textContent = `打不開這份文件:${message}`;
    const home = document.createElement('a');
    home.className = 'mdr-btn-primary mdr-ix';
    home.href = './';
    home.style.marginTop = '16px';
    home.append(MDR.icon('arrow_back'), '回首頁');
    box.append(MDR.icon('error'), msg, home);
    document.body.replaceChildren(box);
    document.documentElement.dataset.mdr = 'error';
  }

  // ---------- 閱讀設定面板(工具列的齒輪)----------
  function buildSheet(d) {
    const el = document.createElement('div');
    el.className = 'pwa-sheet';
    el.id = 'read-sheet';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '閱讀設定');
    el.innerHTML = `
      <div class="pwa-sheet-handle" aria-hidden="true"></div>
      <h2>閱讀設定</h2>
      <div class="pwa-field"><span>主題</span>
        <div class="mdr-seg" id="rs-theme">
          <button type="button" class="mdr-ix" data-value="system">自動</button><button type="button" class="mdr-ix" data-value="light">淺色</button><button type="button" class="mdr-ix" data-value="dark">深色</button><button type="button" class="mdr-ix" data-value="sepia">護眼</button>
        </div>
      </div>
      <div class="pwa-field"><span>字級</span>
        <div class="pwa-stepper">
          <button type="button" class="mdr-icon-btn mdr-ix" id="rs-smaller" aria-label="字變小"><span class="mdr-icon" data-icon="text_decrease" aria-hidden="true"></span></button>
          <output id="rs-size" aria-live="polite"></output>
          <button type="button" class="mdr-icon-btn mdr-ix" id="rs-bigger" aria-label="字變大"><span class="mdr-icon" data-icon="text_increase" aria-hidden="true"></span></button>
        </div>
      </div>
      <div class="pwa-field"><span>行寬</span>
        <div class="mdr-seg" id="rs-width">
          <button type="button" class="mdr-ix" data-value="narrow">窄</button><button type="button" class="mdr-ix" data-value="medium">中</button><button type="button" class="mdr-ix" data-value="wide">寬</button><button type="button" class="mdr-ix" data-value="full">滿版</button>
        </div>
      </div>
      <div class="pwa-field"><span>顯示屬性表</span><button type="button" class="mdr-switch" role="switch" id="rs-props" aria-label="顯示屬性表"></button></div>
      <div class="pwa-field"><span>閱讀進度條</span><button type="button" class="mdr-switch" role="switch" id="rs-progress" aria-label="閱讀進度條"></button></div>
      <label class="pwa-field pwa-field-col"><span>Obsidian 保險庫名稱<small>填了之後,雙中括號連結會用 iPhone 上的 Obsidian 打開</small></span>
        <input class="pwa-input" id="rs-vault" autocomplete="off" autocapitalize="off" placeholder="例如:LLM Wiki">
      </label>
      <div class="pwa-row-actions">
        <a class="mdr-btn mdr-ix" href="./"><span class="mdr-icon" data-icon="arrow_back" aria-hidden="true"></span>回首頁</a>
        <button type="button" class="mdr-btn-primary mdr-ix" id="rs-share"><span class="mdr-icon" data-icon="ios_share" aria-hidden="true"></span>分享這份文件</button>
      </div>`;
    const sheet = PWA.sheet(el);
    const q = (sel) => el.querySelector(sel);
    const SIZE_MIN = 14;
    const SIZE_MAX = 22;
    async function refresh() {
      const s = await MDR.loadSettings();
      PWA.segment(q('#rs-theme'), s.theme, (theme) => MDR.saveSettings({ theme }));
      PWA.segment(q('#rs-width'), s.width, (width) => MDR.saveSettings({ width }));
      q('#rs-size').textContent = `${s.fontSize}px`;
      q('#rs-smaller').disabled = s.fontSize <= SIZE_MIN;
      q('#rs-bigger').disabled = s.fontSize >= SIZE_MAX;
      q('#rs-props').setAttribute('aria-checked', String(s.showProperties));
      q('#rs-progress').setAttribute('aria-checked', String(s.progressBar));
      q('#rs-vault').value = s.obsidianVault;
    }
    const step = async (delta) => {
      const s = await MDR.loadSettings();
      await MDR.saveSettings({ fontSize: Math.min(SIZE_MAX, Math.max(SIZE_MIN, s.fontSize + delta)) });
      refresh();
    };
    q('#rs-smaller').onclick = () => step(-1);
    q('#rs-bigger').onclick = () => step(1);
    for (const [sel, key] of [['#rs-props', 'showProperties'], ['#rs-progress', 'progressBar']]) {
      q(sel).onclick = (e) => {
        const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
        e.currentTarget.setAttribute('aria-checked', String(on));
        MDR.saveSettings({ [key]: on });
      };
    }
    q('#rs-vault').onchange = (e) => MDR.saveSettings({ obsidianVault: e.target.value.trim() });
    q('#rs-share').onclick = () => PWA.shareDoc(d);
    el.addEventListener('sheet-open', () => requestAnimationFrame(refresh));
    MDR_PWA.on('open-options', () => sheet.open()); // 引擎工具列的齒輪
    return el;
  }
})();
