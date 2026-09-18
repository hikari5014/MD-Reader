// 設定:預設值、讀寫、變更通知、套用到畫面
// 閱讀畫面、設定頁、背景管家共用。存在 chrome.storage.sync → 登入同一個 Google 帳號的 Mac/Windows 設定會同步
(() => {
  const DEFAULTS = Object.freeze({
    theme: 'system', // system | light | dark
    fontSize: 16, // 14–22 px
    width: 'medium', // narrow | medium | wide | full
    toc: true, // 寬螢幕時預設顯示目錄
    downloadMode: 'notify', // notify(跳通知,點了才開)| auto(自動開)| off(不處理)
    recordRecent: true, // 記錄最近開過的檔案(顯示在小視窗)
    showProperties: true, // 顯示筆記開頭的屬性表(frontmatter)
    obsidianVault: '', // 填了 → [[連結]] 用 Obsidian App 打開;空白 → 找同資料夾的 .md
  });
  const WIDTHS = { narrow: '680px', medium: '760px', wide: '960px', full: 'none' };

  const loadSettings = () => chrome.storage.sync.get(DEFAULTS);
  const saveSettings = (patch) => chrome.storage.sync.set(patch);
  const resetSettings = () => chrome.storage.sync.clear();

  function onSettingsChanged(callback) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'sync') loadSettings().then(callback);
    });
  }

  // 主題、字級、寬度都用 <html> 上的屬性與 CSS 變數表達,樣式表自己去讀
  function applySettings(doc, s) {
    const html = doc.documentElement;
    html.dataset.mdrTheme = s.theme;
    html.style.setProperty('--mdr-font-size', `${s.fontSize}px`);
    html.style.setProperty('--mdr-width', WIDTHS[s.width] || WIDTHS.medium);
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { DEFAULTS, loadSettings, saveSettings, resetSettings, onSettingsChanged, applySettings });
})();
