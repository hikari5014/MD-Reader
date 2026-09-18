// 設定頁:所有設定改了立刻存(chrome.storage.sync),已開的閱讀分頁會即時跟著變
const version = chrome.runtime.getManifest().version;
document.getElementById('version').textContent = `v${version}`;
document.getElementById('current-version').textContent = `v${version}`;

const PREVIEW = `## 預覽標題\n\n這是一段**示範文字**,用來看字級與主題的效果。[連結長這樣](https://obsidian.md)、[[雙中括號連結]]、==螢光筆==、#標籤。\n\n> [!tip] 提示框\n> Obsidian 風格的提示框。\n\n- [x] 已完成的事\n- [ ] 還沒做的事\n\n\`\`\`js\nconst 問候 = '你好';\n\`\`\``;
const preview = document.getElementById('preview');
preview.innerHTML = MDR.renderMarkdown(PREVIEW);
MDR.enhance(preview);

// ---------- 分頁(網址 #hash 決定,可直接連到 options.html#changelog)----------
function showTab() {
  const tab = location.hash.slice(1) || 'appearance';
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('is-active', a.dataset.tab === tab));
  if (tab === 'changelog') {
    loadChangelog();
    MDR.markUpdateSeen();
  }
  if (tab === 'permission') refreshFileAccess();
}
addEventListener('hashchange', showTab);

// ---------- 設定 ↔ 畫面 ----------
function render(s) {
  MDR.applySettings(document, s);
  document.querySelectorAll('.opt-seg[data-key], .opt-choices[data-key]').forEach((group) => {
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === s[group.dataset.key])));
  });
  document.querySelectorAll('.opt-switch[data-key]').forEach((sw) => sw.setAttribute('aria-checked', String(!!s[sw.dataset.key])));
  document.querySelectorAll('.opt-text[data-key]').forEach((input) => {
    if (document.activeElement !== input) input.value = s[input.dataset.key];
  });
  const range = document.querySelector('input[data-key="fontSize"]');
  range.value = s.fontSize;
  document.getElementById('fontSize-value').textContent = `${s.fontSize} px`;
}

let toastTimer;
async function save(patch) {
  await MDR.saveSettings(patch);
  const toast = document.getElementById('toast');
  toast.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-show'), 1200);
}

document.addEventListener('click', (e) => {
  const choice = e.target.closest('.opt-seg[data-key] button, .opt-choices[data-key] button');
  if (choice) return save({ [choice.parentElement.dataset.key]: choice.dataset.value });
  const sw = e.target.closest('.opt-switch[data-key]');
  if (sw) return save({ [sw.dataset.key]: sw.getAttribute('aria-checked') !== 'true' });
});
// 文字欄:離開欄位或按 Enter 才存
document.querySelectorAll('.opt-text[data-key]').forEach((input) => {
  input.addEventListener('change', () => save({ [input.dataset.key]: input.value.trim() }));
});
// 拖曳中只即時預覽,放開才存(chrome.storage.sync 每分鐘最多寫 120 次)
const fontRange = document.querySelector('input[data-key="fontSize"]');
fontRange.addEventListener('input', () => {
  document.documentElement.style.setProperty('--mdr-font-size', `${fontRange.value}px`);
  document.getElementById('fontSize-value').textContent = `${fontRange.value} px`;
});
fontRange.addEventListener('change', () => save({ fontSize: Number(fontRange.value) }));
document.getElementById('reset').addEventListener('click', () => {
  if (confirm('確定要把所有設定恢復成預設值嗎?')) MDR.resetSettings();
});

document.getElementById('clear-history').addEventListener('click', async (e) => {
  await MDR.clearHistory();
  e.target.textContent = '✓ 已清除';
  setTimeout(() => { e.target.textContent = '清除'; }, 1500);
});

// ---------- 檔案權限 ----------
async function refreshFileAccess() {
  const ok = await chrome.extension.isAllowedFileSchemeAccess();
  const box = document.getElementById('file-access');
  box.textContent = ok ? '✅ 已開啟:可以閱讀電腦裡的 .md 檔' : '⚠️ 尚未開啟:目前看不了電腦裡的 .md 檔';
  box.classList.toggle('is-ok', ok);
}
document.getElementById('open-extension-page').addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFileAccess(); });

// ---------- 更新日誌(用插件自己的排版引擎顯示 CHANGELOG.md)----------
let changelogLoaded = false;
async function loadChangelog() {
  if (changelogLoaded) return;
  changelogLoaded = true;
  const box = document.getElementById('changelog');
  try {
    const text = await (await fetch(chrome.runtime.getURL('CHANGELOG.md'))).text();
    box.innerHTML = MDR.renderMarkdown(text);
    MDR.enhance(box);
    const current = [...box.querySelectorAll('h2')].find((h) => h.textContent.includes(`v${version}`));
    if (current) {
      const badge = document.createElement('span');
      badge.className = 'opt-badge';
      badge.textContent = '目前版本';
      current.append(badge);
    }
  } catch (err) {
    box.textContent = `讀不到更新日誌:${err.message}`;
    changelogLoaded = false;
  }
}

MDR.loadSettings().then(render);
MDR.onSettingsChanged(render);
showTab();
