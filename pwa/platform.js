// 轉接層:排版引擎(extension/core/)原本用 Chrome 插件的 chrome.storage / chrome.runtime,
// 這裡用手機瀏覽器的儲存方式做一份同樣用法的替身,引擎本身一行都不用改。
//   chrome.storage.sync  → localStorage(設定,小)
//   chrome.storage.local → IndexedDB(最近開過的文件內容,可能很大)
//   chrome.runtime       → 引擎檔案的網址、版本號、訊息(載入流程圖元件、打開設定面板)
(() => {
  const VERSION = '2.0.0';
  const ENGINE = new URL('../extension/', document.currentScript.src).href;
  const listeners = [];
  const handlers = {};

  // chrome.storage 的 get 可以傳:null(全部)、'鍵'、['鍵', …]、{ 鍵: 預設值 }
  function select(all, keys) {
    if (keys == null) return { ...all };
    if (typeof keys === 'string') keys = [keys];
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k]]));
    return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in all ? all[k] : d]));
  }
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  function notify(area, before, after) {
    const changes = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { oldValue: before[k], newValue: after[k] };
    }
    if (Object.keys(changes).length) listeners.forEach((fn) => fn(changes, area));
  }

  // 做出一個 chrome.storage 區塊:load() 讀出整包、save(整包) 寫回
  function area(name, load, save) {
    const update = async (fn) => {
      const before = await load();
      const after = fn({ ...before });
      await save(after);
      notify(name, before, after);
    };
    return {
      get: async (keys) => clone(select(await load(), keys)),
      set: (patch) => update((all) => Object.assign(all, clone(patch))),
      remove: (keys) => update((all) => { [].concat(keys).forEach((k) => delete all[k]); return all; }),
      clear: () => update(() => ({})),
    };
  }

  // 設定 → localStorage;無痕模式等讀寫失敗時退回只存在記憶體
  let memory = {};
  const sync = area('sync', async () => {
    try { return JSON.parse(localStorage.getItem('mdr-sync') || '{}'); } catch { return { ...memory }; }
  }, async (all) => {
    memory = all;
    try { localStorage.setItem('mdr-sync', JSON.stringify(all)); } catch { /* 只存在記憶體 */ }
  });

  // 文件 → IndexedDB(整包存成一筆)
  let dbPromise = null;
  const openDb = () => (dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('mdr', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const idb = (mode, fn) => openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  }));
  let localMemory = {};
  const local = area('local', async () => {
    try { return (await idb('readonly', (s) => s.get('local'))) || {}; } catch { return { ...localMemory }; }
  }, async (all) => {
    localMemory = all;
    try { await idb('readwrite', (s) => s.put(all, 'local')); } catch { /* 只存在記憶體 */ }
  });

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = ENGINE + file;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('載入元件失敗(沒有網路,而且之前沒用過這個功能)'));
      document.head.append(s);
    });
  }

  globalThis.chrome = {
    storage: { sync, local, onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: {
      getURL: (path) => ENGINE + path,
      getManifest: () => ({ name: 'MD隨手讀', version: VERSION }),
      async sendMessage(msg) {
        if (msg.type === 'load-script') return loadScript(msg.file); // 流程圖元件:有流程圖才載入
        return handlers[msg.type]?.(msg); // 例如 open-options → 打開設定面板
      },
    },
  };
  // 手機版外殼註冊「引擎要求做某件事」時的處理方式
  globalThis.MDR_PWA = { VERSION, on: (type, fn) => { handlers[type] = fn; } };
})();
