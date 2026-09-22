// Mermaid 流程圖:```mermaid 區塊 → 圖。元件約 3.5MB,文件裡真的有流程圖才載入
(() => {
  // 流程圖的 SVG 也要消毒;Mermaid 的文字標籤放在 foreignObject 裡,要特別允許
  const SVG_PURIFY = { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'], HTML_INTEGRATION_POINTS: { foreignobject: true } };
  let loading = null;

  function loadMermaid() {
    if (globalThis.mermaid) return Promise.resolve();
    loading ||= location.protocol === 'chrome-extension:'
      ? new Promise((resolve, reject) => { // 插件自己的頁面(閱讀頁):直接加 <script>
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('vendor/mermaid.min.js');
        s.onload = resolve;
        s.onerror = () => reject(new Error('載入流程圖元件失敗'));
        document.head.append(s);
      })
      : chrome.runtime.sendMessage({ type: 'load-script', file: 'vendor/mermaid.min.js' }).then((r) => { // 一般網頁:請背景管家注入
        if (r !== true) throw new Error(r || '載入流程圖元件失敗');
      });
    loading.catch(() => { loading = null; });
    return loading;
  }

  function showError(box, message) {
    box.classList.remove('is-loading');
    box.classList.add('is-error');
    const note = document.createElement('div');
    note.className = 'mdr-mermaid-error';
    note.append(MDR.icon('warning'), message);
    const pre = document.createElement('pre');
    pre.textContent = box.dataset.source;
    box.replaceChildren(note, pre);
  }

  let seq = 0;
  // 第一次呼叫:把 ```mermaid 換成佔位框;之後(例如切換深淺色)用保存的原始碼重畫
  async function renderDiagrams(root, dark) {
    root.querySelectorAll('pre > code.language-mermaid').forEach((code) => {
      const box = document.createElement('div');
      box.className = 'mdr-mermaid';
      box.dataset.source = code.textContent;
      // 載入、繪製中:佔好位置,轉圈 0.3 秒後才浮出(CSS 延遲),很快畫好就不會閃
      box.classList.add('is-loading');
      const label = document.createElement('span');
      label.textContent = '正在畫流程圖…';
      box.append(MDR.spinner(22), label);
      code.parentElement.replaceWith(box);
    });
    const boxes = [...root.querySelectorAll('.mdr-mermaid')];
    if (!boxes.length) return;
    try {
      await loadMermaid();
    } catch (e) {
      boxes.forEach((box) => showError(box, e.message));
      return;
    }
    globalThis.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'inherit' });
    for (const box of boxes) {
      const id = `mdr-mermaid-${++seq}`;
      try {
        const { svg } = await globalThis.mermaid.render(id, box.dataset.source);
        box.classList.remove('is-error', 'is-loading');
        box.classList.add('is-ready');
        box.innerHTML = globalThis.DOMPurify.sanitize(svg, SVG_PURIFY);
      } catch (e) {
        showError(box, `流程圖語法有誤:${String(e.message || e).split('\n')[0]}`);
      } finally {
        document.getElementById(`d${id}`)?.remove(); // Mermaid 畫失敗時會留下暫存元素
      }
    }
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { renderDiagrams });
})();
