// ---- 第 0 期實驗用:Google Drive 診斷按鈕(v0.4 會換成正式的「📖 排版閱讀」)----
// 在 Drive 右下角放一顆按鈕,按下去收集:檔案 ID、頁面結構、能否抓到原文,方便回報。
(() => {
  const btn = document.createElement('button');
  btn.textContent = '🧪 MD隨手讀 Drive 診斷';
  btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:10px 14px;border:0;border-radius:999px;background:#7c5cff;color:#fff;font:600 14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer';
  document.documentElement.append(btn);
  btn.onclick = runProbe;

  function collectIds() {
    const found = new Map();
    const fromUrl = location.href.match(/\/file\/d\/([\w-]{20,})/) || location.href.match(/[?&]id=([\w-]{20,})/);
    if (fromUrl) found.set(fromUrl[1], '網址');
    document.querySelectorAll('[data-id]').forEach((el) => {
      const label = el.getAttribute('aria-label') || el.textContent || '';
      const selected = el.getAttribute('aria-selected') === 'true';
      if ((selected || /\.md\b/i.test(label)) && /^[\w-]{20,}$/.test(el.dataset.id)) {
        found.set(el.dataset.id, (selected ? '選取中:' : '列表:') + label.trim().slice(0, 60));
      }
    });
    return [...found].slice(0, 5).map(([id, from]) => ({ id, from }));
  }

  async function runProbe() {
    btn.textContent = '⏳ 診斷中…';
    const ids = collectIds();
    const pres = [...document.querySelectorAll('pre')].sort((a, b) => b.textContent.length - a.textContent.length);
    const report = {
      time: new Date().toISOString(),
      url: location.href,
      title: document.title,
      ids,
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src).filter(Boolean).slice(0, 5),
      largestPre: pres[0] ? pres[0].textContent.slice(0, 200) : null,
      fetches: ids.length ? await chrome.runtime.sendMessage({ type: 'drive-probe', ids: ids.map((x) => x.id) }) : '找不到檔案 ID',
    };
    btn.textContent = '🧪 MD隨手讀 Drive 診斷';
    showReport(JSON.stringify(report, null, 2));
  }

  function showReport(text) {
    document.getElementById('mdr-probe-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'mdr-probe-panel';
    panel.style.cssText = 'position:fixed;right:20px;bottom:72px;z-index:2147483647;width:min(560px,90vw);max-height:60vh;display:flex;flex-direction:column;gap:8px;padding:12px;background:#fff;color:#222;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.3);font:13px sans-serif';
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;overflow:auto;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:#f5f5f7;padding:10px;border-radius:8px';
    pre.textContent = text;
    const copy = document.createElement('button');
    copy.textContent = '📋 複製診斷結果(貼回給 Claude)';
    copy.style.cssText = 'padding:8px;border:0;border-radius:8px;background:#7c5cff;color:#fff;font-weight:600;cursor:pointer';
    copy.onclick = async () => { await navigator.clipboard.writeText(text); copy.textContent = '✅ 已複製'; };
    const close = document.createElement('button');
    close.textContent = '關閉';
    close.style.cssText = 'padding:6px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer';
    close.onclick = () => panel.remove();
    panel.append(pre, copy, close);
    document.documentElement.append(panel);
  }
})();
