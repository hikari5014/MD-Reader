// 介面小工具:Material 圖示元素、按下時的水波紋、分段按鈕的滑動色塊、載入與過場、觸控
// 閱讀畫面(注入網頁)與所有插件頁面共用;樣式在 styles/ui.css
(() => {
  // <span class="mdr-icon" data-icon="settings" aria-hidden="true"></span>
  function icon(name, doc = document) {
    const el = doc.createElement('span');
    el.className = 'mdr-icon';
    el.dataset.icon = name;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  // 在 root 底下所有 .mdr-ix 元素上,按下時從按的位置擴散水波紋,放開後淡出
  function enableRipple(root) {
    root.addEventListener('pointerdown', (e) => {
      const host = e.target.closest?.('.mdr-ix');
      if (!host || host.disabled || e.button !== 0) return;
      const rect = host.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const ripple = host.ownerDocument.createElement('span');
      ripple.className = 'mdr-ripple';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      let box = host.querySelector(':scope > .mdr-ripple-box');
      if (!box) {
        box = host.ownerDocument.createElement('span');
        box.className = 'mdr-ripple-box';
        host.append(box);
      }
      box.append(ripple);
      const leave = () => {
        ripple.classList.add('is-leaving');
        setTimeout(() => ripple.remove(), 600);
      };
      host.addEventListener('pointerup', leave, { once: true });
      host.addEventListener('pointerleave', leave, { once: true });
      host.addEventListener('pointercancel', leave, { once: true }); // 手指一滑變成捲動時,瀏覽器會取消這次按下
    });
  }

  // 分段按鈕:把選中色塊移到 aria-pressed="true" 的那一顆(寬度、位置都用動畫過去)
  function moveSegThumb(group) {
    let thumb = group.querySelector('.mdr-seg-thumb');
    if (!thumb) {
      thumb = group.ownerDocument.createElement('span');
      thumb.className = 'mdr-seg-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      group.prepend(thumb);
    }
    const on = group.querySelector('button[aria-pressed="true"]');
    if (!on || !on.offsetWidth) return; // 隱藏的分頁量不到寬度,等顯示時再算
    thumb.style.setProperty('--x', `${on.offsetLeft}px`);
    thumb.style.setProperty('--w', `${on.offsetWidth}px`);
  }

  // ---------- 載入與過場 ----------
  const LOADER_DELAY = 300; // 等超過這麼久才顯示載入(快的操作不閃轉圈)
  const LOADER_MIN = 500; // 一旦顯示,至少停這麼久(不會閃一下就消失)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 圓形轉圈:<svg class="mdr-spinner">,樣式在 ui.css
  function spinner(size = 24, doc = document) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mdr-spinner');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.setProperty('--mdr-spinner-size', `${size}px`);
    for (const cls of ['mdr-spinner-track', 'mdr-spinner-arc']) {
      const c = doc.createElementNS(NS, 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', '24');
      c.setAttribute('cy', '24');
      c.setAttribute('r', '20');
      svg.append(c);
    }
    return svg;
  }

  // 做 work;超過 LOADER_DELAY 才呼叫 show(),顯示了就至少停 LOADER_MIN 再 hide()
  async function withLoader(work, show, hide) {
    let shownAt = 0;
    const timer = setTimeout(() => { shownAt = performance.now(); show(); }, LOADER_DELAY);
    try {
      return await work();
    } finally {
      clearTimeout(timer);
      if (shownAt) {
        await wait(Math.max(0, LOADER_MIN - (performance.now() - shownAt)));
        await hide();
      }
    }
  }

  // 整頁過場(閱讀頁開檔):掛在 <html> 而不是 <body>,排版時換掉 body 也不會把它瞬間拿掉
  let pageEl = null;
  const pageLoader = {
    show(text) {
      pageEl ||= document.createElement('div');
      pageEl.className = 'mdr-page-loader';
      pageEl.setAttribute('role', 'status');
      const mark = document.createElement('span');
      mark.className = 'mdr-page-loader-mark';
      mark.append(icon('auto_stories'));
      const bar = document.createElement('div');
      bar.className = 'mdr-linear';
      const label = document.createElement('div');
      label.className = 'mdr-page-loader-text';
      label.textContent = text;
      pageEl.replaceChildren(mark, bar, label);
      document.documentElement.append(pageEl);
      const el = pageEl;
      requestAnimationFrame(() => el.classList.add('is-visible'));
    },
    async hide() {
      if (!pageEl) return;
      pageEl.classList.add('is-leaving');
      pageEl.classList.remove('is-visible');
      await wait(320);
      pageEl.remove();
      pageEl = null;
    },
  };

  // 內容切換(fade through):舊內容淡出 → update() 換內容 → 新內容淡入並微微放大
  async function swap(el, update) {
    el.classList.remove('mdr-fade-in');
    el.classList.add('mdr-fade-out');
    await wait(90);
    update();
    el.classList.remove('mdr-fade-out');
    void el.offsetWidth;
    el.classList.add('mdr-fade-in');
  }

  // ---------- 觸控 ----------
  // 長按(手指):有 data-tip 的按鈕按住 0.5 秒 → 顯示說明泡泡 1.5 秒;移動超過 8px 算捲動、取消;長按後放手不觸發按鈕
  function enableTouch(root) {
    root.addEventListener('touchstart', () => {}, { passive: true }); // iOS / iPadOS 要有 touchstart 監聽,:active 才會生效
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const host = e.target.closest?.('[data-tip]');
      if (!host) return;
      const start = { x: e.clientX, y: e.clientY };
      host.classList.add('is-long-pressing');
      const timer = setTimeout(() => {
        host.classList.remove('is-long-pressing');
        host.classList.add('is-tip-shown');
        navigator.vibrate?.(10);
        // 吞掉「這次放手」的 click;沒有 click 也會在放手後解除,不會吃到下一次
        const stop = (c) => { c.preventDefault(); c.stopImmediatePropagation(); };
        host.addEventListener('click', stop, { capture: true, once: true });
        globalThis.addEventListener('pointerup', () => setTimeout(() => host.removeEventListener('click', stop, { capture: true }), 0), { once: true });
        setTimeout(() => host.classList.remove('is-tip-shown'), 1500);
      }, 500);
      const cancel = () => {
        clearTimeout(timer);
        host.classList.remove('is-long-pressing');
        root.removeEventListener('pointermove', onMove);
      };
      const onMove = (m) => { if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > 8) cancel(); };
      root.addEventListener('pointermove', onMove);
      host.addEventListener('pointerup', cancel, { once: true });
      host.addEventListener('pointercancel', cancel, { once: true });
    });
  }

  // 往左拖關閉的抽屜:跟著手指走(拖曳中不要轉場),放手時拖超過 1/3 寬度或甩一下就呼叫 onClose,否則彈回
  function swipeToClose(panel, onClose, enabled = () => true) {
    panel.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !enabled()) return;
      const start = { x: e.clientX, y: e.clientY };
      let dragging = false;
      let last = { x: e.clientX, t: e.timeStamp };
      let velocity = 0;
      const move = (m) => {
        const dx = m.clientX - start.x;
        if (!dragging) {
          if (Math.hypot(dx, m.clientY - start.y) < 8) return;
          if (Math.abs(m.clientY - start.y) > Math.abs(dx) || dx > 0) return end(); // 上下捲目錄、往右拖:不處理
          dragging = true;
          panel.classList.add('is-dragging');
        }
        velocity = (m.clientX - last.x) / Math.max(1, m.timeStamp - last.t);
        last = { x: m.clientX, t: m.timeStamp };
        panel.style.setProperty('--mdr-toc-dx', `${Math.min(0, dx)}px`);
      };
      const end = () => {
        panel.removeEventListener('pointermove', move);
        panel.removeEventListener('pointerup', end);
        panel.removeEventListener('pointercancel', end);
        if (!dragging) return;
        panel.classList.remove('is-dragging');
        const dx = parseFloat(panel.style.getPropertyValue('--mdr-toc-dx')) || 0;
        panel.style.removeProperty('--mdr-toc-dx');
        if (-dx > panel.offsetWidth / 3 || velocity < -0.5) onClose();
        const stop = (c) => { c.preventDefault(); c.stopImmediatePropagation(); };
        panel.addEventListener('click', stop, { capture: true, once: true }); // 拖完放手不要點到目錄連結
        setTimeout(() => panel.removeEventListener('click', stop, { capture: true }), 0);
      };
      panel.addEventListener('pointermove', move);
      panel.addEventListener('pointerup', end);
      panel.addEventListener('pointercancel', end);
    });
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { icon, enableRipple, moveSegThumb, spinner, withLoader, pageLoader, swap, enableTouch, swipeToClose });
})();
