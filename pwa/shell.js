// 手機版外殼共用:文件庫(最近開過)、底部面板、提示條、分享、離線
(() => {
  const MAX_DOCS = 30;

  // ---------- 文件庫:每份文件連內容一起存在手機裡(iPhone 記不住原檔位置,重看只能靠這份)----------
  // doc:{ id, name, text, time, kind: 'file' | 'text' | 'web' | 'drive', src? }
  async function listDocs() {
    const { docs = [] } = await chrome.storage.local.get('docs');
    return docs;
  }
  async function saveDoc({ name, text, kind, src = '' }) {
    const docs = await listDocs();
    // 同一個來源(網址 / Drive 檔)或同名的本機檔再開一次:取代舊的,不要重複
    const same = (d) => d.kind === kind && (src ? d.src === src : d.name === name);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const next = [{ id, name, text, kind, src, time: Date.now() }, ...docs.filter((d) => !same(d))].slice(0, MAX_DOCS);
    await chrome.storage.local.set({ docs: next });
    return id;
  }
  async function removeDoc(id) {
    const docs = await listDocs();
    await chrome.storage.local.set({ docs: docs.filter((d) => d.id !== id) });
  }
  const clearDocs = () => chrome.storage.local.remove(['docs', 'recent']);
  const readUrl = (id) => `read.html?doc=${encodeURIComponent(id)}`;

  // 讀進來的內容像不像文字檔(選到圖片、PDF 時擋下來)
  const looksLikeText = (text) => !text.slice(0, 4000).includes('\u0000');

  // ---------- 提示條 ----------
  let toastEl = null;
  let toastTimer = 0;
  function toast(text, icon = 'check_circle', ms = 2000) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'pwa-toast';
      toastEl.setAttribute('role', 'status');
      document.body.append(toastEl);
    }
    toastEl.classList.toggle('is-error', icon === 'error' || icon === 'warning');
    toastEl.replaceChildren(MDR.icon(icon), text);
    requestAnimationFrame(() => toastEl.classList.add('is-show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), ms);
  }

  // ---------- 底部面板:open() / close();拖把手往下超過 30% 或甩一下就關;點背景、Esc 也能關 ----------
  function sheet(el) {
    const scrim = document.createElement('div');
    scrim.className = 'pwa-scrim';
    if (el.isConnected) el.before(scrim);
    const handle = el.querySelector('.pwa-sheet-handle');
    let opener = null;
    const setY = (dy) => {
      el.style.setProperty('--dy', `${dy}px`);
      scrim.style.setProperty('--scrim', String(Math.max(0, 1 - dy / el.offsetHeight)));
    };
    const onKey = (e) => { if (e.key === 'Escape') api.close(); };
    const api = {
      el,
      isOpen: () => el.classList.contains('is-open'),
      open() {
        opener = document.activeElement;
        if (!scrim.isConnected) el.before(scrim); // 面板比畫面先建立時,打開才放遮罩
        setY(0);
        el.hidden = false;
        requestAnimationFrame(() => {
          el.classList.add('is-open');
          scrim.classList.add('is-open');
        });
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        document.addEventListener('keydown', onKey);
        el.dispatchEvent(new Event('sheet-open'));
      },
      close() {
        el.classList.remove('is-open', 'is-dragging');
        scrim.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => setY(0), 320);
        opener?.focus?.({ preventScroll: true });
      },
    };
    scrim.addEventListener('click', () => api.close());
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
    // 拖把手(手指或滑鼠):跟著走,放手看距離與速度
    handle?.addEventListener('pointerdown', (e) => {
      const startY = e.clientY;
      let last = { y: e.clientY, t: e.timeStamp };
      let v = 0;
      handle.setPointerCapture?.(e.pointerId);
      el.classList.add('is-dragging');
      const move = (m) => {
        const dy = m.clientY - startY;
        v = (m.clientY - last.y) / Math.max(1, m.timeStamp - last.t);
        last = { y: m.clientY, t: m.timeStamp };
        setY(dy < 0 ? dy * 0.2 : dy); // 往上拉有阻力
      };
      const up = (u) => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        el.classList.remove('is-dragging');
        const dy = u.clientY - startY;
        if (dy > el.offsetHeight * 0.3 || v > 0.5) api.close();
        else setY(0);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    return api;
  }

  // ---------- 分享這份文件:優先分享成 .md 檔,不支援就分享文字,再不行就複製 ----------
  async function shareDoc(doc) {
    const name = /\.(md|markdown)$/i.test(doc.name) ? doc.name : `${doc.name}.md`;
    const file = new File([doc.text], name, { type: 'text/markdown' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: doc.name });
      else if (navigator.share) await navigator.share({ title: doc.name, text: doc.text });
      else {
        await navigator.clipboard.writeText(doc.text);
        toast('這個瀏覽器不能分享,已改成複製全文');
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast(`分享失敗:${e.message}`, 'error'); // AbortError = 使用者自己取消
    }
  }

  // ---------- 分段按鈕(設定面板用)----------
  function segment(group, value, onPick) {
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(value))));
    MDR.moveSegThumb(group);
    group.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      MDR.moveSegThumb(group);
      onPick(b.dataset.value);
    };
  }

  // ---------- 離線:註冊背景快取程式(第一次開啟後,沒網路也能用)----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 不影響使用,只是不能離線 */ });
  }

  globalThis.PWA = { listDocs, saveDoc, removeDoc, clearDocs, readUrl, looksLikeText, toast, sheet, shareDoc, segment };
})();
