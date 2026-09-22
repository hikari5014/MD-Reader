// 手機版設定(會公開在網站上,不能放密碼或金鑰)
// GOOGLE_CLIENT_ID:Google Cloud 的「OAuth 用戶端 ID」(網頁應用程式類型)。它本來就是公開的,放這裡是安全的。
// 申請步驟見 docs/guide/PWA-GOOGLE-DRIVE.md;空白 = 不啟用 Google Drive 登入。
globalThis.MDR_CONFIG = {
  GOOGLE_CLIENT_ID: '',
};
