# 手機版開啟 Google Drive 登入(一次性設定,約 10 分鐘)

手機版的「Google Drive」入口,要先向 Google 申請一組「OAuth 用戶端 ID」(讓 Google 知道是哪個 App 要讀你的雲端硬碟)。這要用**你的 Google 帳號**在 Google Cloud 操作,Claude 沒辦法代辦。

> 還沒設定前也能用:iPhone 裝 **Google Drive App** → 手機版首頁「選擇檔案」→ 左上角「瀏覽」→ 選 Google Drive,一樣能挑檔。

## 步驟

1. 打開 <https://console.cloud.google.com/>,用你的 Google 帳號登入。
2. **建立專案**:上方專案選單 →「新增專案」→ 名稱填 `MD隨手讀` → 建立,並切換到這個專案。
3. **啟用 Drive API**:左側選單「API 和服務」→「程式庫」→ 搜尋 `Google Drive API` → 點進去按「啟用」。
4. **OAuth 同意畫面**(左側「Google Auth Platform」或「OAuth 同意畫面」):
   - 應用程式名稱:`MD隨手讀`;使用者支援電子郵件、開發人員聯絡資訊:填你的 Gmail
   - 目標對象:選「**外部**」
   - 發布狀態:**保持「測試中」**,不用送審
   - 「測試使用者」→ 新增你自己的 Gmail(只有名單上的帳號能登入)
5. **權限範圍**(「資料存取」):新增範圍 → 搜尋並勾選 `.../auth/drive.readonly`(查看及下載所有 Google 雲端硬碟檔案)→ 儲存。
6. **建立用戶端 ID**(「用戶端」或「憑證」→「建立憑證」→「OAuth 用戶端 ID」):
   - 應用程式類型:**網頁應用程式**
   - 名稱:`MD隨手讀 手機版`
   - 已授權的 JavaScript 來源:`https://hikari5014.github.io`
   - 已授權的重新導向 URI:`https://hikari5014.github.io/MD-Reader/pwa/`(最後的 `/` 要有)
   - 按「建立」,複製畫面上的「**用戶端 ID**」(長得像 `123456-abc….apps.googleusercontent.com`)
7. 把用戶端 ID 貼給 Claude,Claude 會填進 `pwa/config.js` 並重新發布。(自己改也可以:填進 `GOOGLE_CLIENT_ID: ''` 的引號裡,並把 `pwa/sw.js`、`pwa/platform.js` 的版本號加一)

## 常見問題

- **用戶端 ID 公開在網站上安全嗎?** 安全。它本來就是公開的識別碼,而且只接受上面填的網址。**「用戶端密鑰」(Client secret)不要給任何人**,手機版也用不到。
- **登入時出現「Google 尚未驗證這個應用程式」**:因為這是你自己的 App、還在「測試中」。點「繼續」即可。
- **每次都要重新登入?** 登入狀態 1 小時後失效(只存在這支手機),過期會自動回到登入按鈕。
- **iPhone 主畫面 App 登入失敗、停在 Google 頁面**:iPhone 對主畫面 App 的登入跳轉有限制,這一項要實機測試才知道。若不順,請截圖告訴 Claude;替代做法是上面的「Google Drive App + 選擇檔案」。
