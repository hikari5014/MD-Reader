// 介面小工具:Material 圖示元素、按下時的水波紋、分段按鈕的滑動色塊
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

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { icon, enableRipple, moveSegThumb });
})();
