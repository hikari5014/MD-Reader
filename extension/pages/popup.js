// 工具列小視窗:開啟檔案、貼上文字或網址、最近開過、設定入口
// 注意:小視窗一失去焦點就會關閉,所以「選檔」改開一個分頁來做(Mac 的選檔視窗會搶走焦點)
const KIND = { file: ['📄', '本機'], web: ['🌐', '網路'], drive: ['☁️', 'Drive'], text: ['📋', '貼上'] };
document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

// 開新分頁後關掉小視窗
async function openTab(url) {
  await chrome.tabs.create({ url });
  window.close();
}

// ---------- 開啟檔案 / 貼上 ----------
document.getElementById('open-file').onclick = () => openTab(chrome.runtime.getURL('pages/open.html'));

const paste = document.getElementById('paste');
const pasteGo = document.getElementById('paste-go');
paste.addEventListener('input', () => { pasteGo.disabled = !paste.value.trim(); });
document.getElementById('paste-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { src, text } = MDR.parsePasted(paste.value);
  if (src) return openTab(MDR.viewerUrl({ src }));
  if (!text) return;
  const doc = await MDR.saveDoc('貼上的文字', text);
  openTab(MDR.viewerUrl({ doc }));
});
paste.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) document.getElementById('paste-form').requestSubmit();
});

// ---------- 最近開過 ----------
function timeAgo(t) {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  if (hr < 48) return '昨天';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function renderRecent(settings, fileAccess) {
  const list = document.getElementById('recent');
  const empty = document.getElementById('recent-empty');
  const items = settings.recordRecent ? await MDR.listRecent() : [];
  list.replaceChildren(...items.slice(0, 8).map((item) => {
    const [icon, label] = KIND[item.kind];
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.title = item.src || item.title;
    b.innerHTML = '<span class="pp-kind"></span><span class="pp-title"></span><span class="pp-meta"></span>';
    b.querySelector('.pp-kind').textContent = icon;
    b.querySelector('.pp-title').textContent = item.title;
    b.querySelector('.pp-meta').textContent = `${label} · ${timeAgo(item.time)}`;
    // 本機檔要有檔案權限才開得了(Chrome 118+),沒有就帶去引導頁
    b.onclick = () => openTab(item.kind === 'file' && !fileAccess ? chrome.runtime.getURL('pages/onboarding.html') : MDR.reopenUrl(item));
    li.append(b);
    return li;
  }));
  empty.hidden = items.length > 0;
  empty.textContent = settings.recordRecent ? '還沒有紀錄,開過的 .md 會出現在這裡' : '已關閉紀錄(可在設定開啟)';
}

// ---------- 在 Google Drive 上打開小視窗:直接開目前選的 .md ----------
async function showDriveCard() {
  const forTab = Number(new URLSearchParams(location.search).get('tab')); // 自動化測試用:指定要看哪個分頁
  const [tab] = forTab ? [await chrome.tabs.get(forTab)] : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/(drive|docs)\.google\.com\//.test(tab.url || '')) return;
  const box = document.getElementById('drive');
  const title = document.createElement('div');
  title.className = 'pp-drive-title';
  title.textContent = '☁️ Google Drive';
  const body = document.createElement('div');
  box.replaceChildren(title, body);
  box.hidden = false;
  let file = null;
  try {
    file = (await chrome.tabs.sendMessage(tab.id, { type: 'drive-current-file' }))?.file;
  } catch {
    // 插件更新前就開著的分頁,沒有 MD隨手讀 的小程式(Chrome 的規定)
    body.textContent = '這個分頁要先重新整理,MD隨手讀 才讀得到 Drive 的檔案。';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = '🔄 重新整理這個分頁';
    reload.onclick = () => { chrome.tabs.reload(tab.id); window.close(); };
    box.append(reload);
    return;
  }
  if (!file) {
    body.textContent = '在 Drive 點一下 .md 檔(或打開預覽),再按一次 MD隨手讀 圖示;頁面右下角也會出現紫色按鈕。';
    return;
  }
  body.remove();
  const open = document.createElement('button');
  open.type = 'button';
  open.id = 'drive-open';
  open.textContent = `📖 用 MD隨手讀 開啟 ${file.name}`;
  open.onclick = () => openTab(`${MDR.viewerUrl({ src: MDR.driveUrl(file.id) })}&name=${encodeURIComponent(file.name)}`);
  box.append(open);
}
showDriveCard();

// ---------- 設定入口 ----------
document.getElementById('open-settings').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
document.getElementById('open-guide').onclick = () => openTab(chrome.runtime.getURL('pages/options.html#guide'));
document.getElementById('open-changelog').onclick = () => openTab(chrome.runtime.getURL('pages/options.html#changelog'));
document.getElementById('fix-access').onclick = () => openTab(chrome.runtime.getURL('pages/options.html#permission'));

(async () => {
  const [settings, fileAccess] = await Promise.all([MDR.loadSettings(), chrome.extension.isAllowedFileSchemeAccess()]);
  MDR.applySettings(document, settings);
  document.getElementById('warn').hidden = fileAccess;
  if (await MDR.hasUnseenUpdate()) document.getElementById('open-changelog').classList.add('has-update');
  renderRecent(settings, fileAccess);
})();
