// Google Drive:登入 → 列出雲端硬碟裡的 .md → 下載內容
// 登入用「整頁跳轉」而不是彈出視窗:iPhone 主畫面 App 常擋彈出視窗、或卡在一直轉圈
// 權限只要「讀取」(drive.readonly);登入憑證 1 小時後失效,只存在這支手機
(() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const TOKEN_KEY = 'mdr-drive-token';
  const STATE_KEY = 'mdr-drive-state';
  // .md 上傳到 Drive 後,檔案類型可能被標成這幾種;再用副檔名篩一次
  const MIME_Q = ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream'].map((m) => `mimeType='${m}'`).join(' or ');
  const isMd = (name) => /\.(md|markdown|mdown|mkd)$/i.test(name);

  const clientId = () => globalThis.MDR_CONFIG?.GOOGLE_CLIENT_ID || '';
  const redirectUri = () => new URL('./', location.href).href; // 登入後回到首頁

  function readToken() {
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return t && t.exp > Date.now() + 30_000 ? t.token : null;
    } catch { return null; }
  }
  const saveToken = (token, seconds) => { try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + seconds * 1000 })); } catch { /* 無痕模式 */ } };
  const forget = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* 無痕模式 */ } };

  function signIn() {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(STATE_KEY, state); } catch { /* 無痕模式 */ }
    const q = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri(),
      response_type: 'token',
      scope: SCOPE,
      include_granted_scopes: 'true',
      state,
    });
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  }

  // 首頁載入時呼叫:網址 # 後面帶著登入結果就收下來。回傳 'ok' | 'error' | null(不是登入回來)
  function handleRedirect() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has('access_token') && !h.has('error')) return null;
    history.replaceState(null, '', location.pathname + location.search); // 憑證不要留在網址上
    let expected = null;
    try { expected = localStorage.getItem(STATE_KEY); localStorage.removeItem(STATE_KEY); } catch { /* 無痕模式 */ }
    if (h.has('error') || h.get('state') !== expected) return 'error';
    saveToken(h.get('access_token'), Number(h.get('expires_in')) || 3600);
    return 'ok';
  }

  async function call(url) {
    const token = readToken();
    if (!token) throw Object.assign(new Error('登入已過期,請重新登入'), { code: 'auth' });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {
      throw new Error('連不上 Google Drive,請檢查網路');
    });
    if (res.status === 401) { forget(); throw Object.assign(new Error('登入已過期,請重新登入'), { code: 'auth' }); }
    if (!res.ok) throw new Error(`Google Drive 回應 ${res.status}`);
    return res;
  }

  // 列出 .md(最新修改的在前);search 有填就只找檔名含這些字的
  async function list(search = '', pageToken = '') {
    let q = `trashed=false and (${MIME_Q})`;
    if (search.trim()) q += ` and name contains '${search.trim().replace(/['\\]/g, '\\$&')}'`;
    const params = new URLSearchParams({ q, orderBy: 'modifiedTime desc', pageSize: '100', fields: 'nextPageToken,files(id,name,modifiedTime,size)' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await (await call(`${API}?${params}`)).json();
    return { files: (data.files || []).filter((f) => isMd(f.name)), next: data.nextPageToken || '' };
  }

  const download = async (id) => (await call(`${API}/${encodeURIComponent(id)}?alt=media`)).text();

  async function signOut() {
    const token = readToken();
    forget();
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  }

  globalThis.PWA_DRIVE = { configured: () => !!clientId(), signedIn: () => !!readToken(), signIn, handleRedirect, list, download, signOut, redirectUri };
})();
