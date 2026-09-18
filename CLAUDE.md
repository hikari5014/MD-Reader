# MD隨手讀 — 專案指示

Chrome 全方位 Markdown 閱讀插件(Manifest V3)。PM 決策、版本規劃見 `docs/plans/v0.1.0-plan.html`;每次對話先讀 `docs/progress/TODO.md` 與 `PROGRESS.md`。

## PM 已拍板(2026-09-18)

做法 C 從零輕量版 ・ 先自用不上架 ・ Google Drive 用網頁版 ・ 要 Obsidian 語法(wikilink/callout/frontmatter)・ 下載 .md 跳通知點了才開 ・ 只讀不編輯 ・ Obsidian 風外觀 ・ 只支援 Chrome ・ Mac + Windows ・ 名稱「MD隨手讀」

## 技術原則

- **零建置**:`extension/` 直接載入 Chrome;第三方元件用 `npm run sync` 從 node_modules 複製進 `extension/vendor/`,不從網路載入程式。
- **更新日誌只改 `docs/changelog/CHANGELOG.md`、使用說明只改 `docs/guide/GUIDE.md`**,再跑 `npm run sync` 複製進 `extension/`(設定頁顯示用);`npm test`、`npm run release` 都會檢查是否一致。新功能要同步更新使用說明。
- **所有使用者可調的項目都進設定頁**(PM 要求):預設值定義在 `core/settings.js` 的 `DEFAULTS`,UI 在 `pages/options.*`,存 `chrome.storage.sync`。
- **排版引擎只有一份**:`core/` 同時給就地排版(content script)、閱讀頁(viewer)、設定頁、背景管家(importScripts)用,掛在 `globalThis.MDR`。閱讀畫面外殼(目錄、工具列)在 `core/reader.js`。
- **一律消毒**:任何 Markdown 轉出的 HTML 都要過 `MDR.renderMarkdown`(內含 DOMPurify),不可繞過。
- **樣式全部掛在 `html[data-mdr]` 底下**:`reader.css` 會被注入所有 .md 網址(包括 GitHub 這種本來就是網頁的),不能影響沒被排版的頁面。
- **背景管家是 classic script**(不是 module):頂層函式是全域的,自動化測試直接呼叫 `openDownloadFromNotification()`、`openFromContextMenu()`。
- **小視窗(popup)不能放需要離開焦點的操作**:拖放、選檔視窗都會讓小視窗關閉 → 改開分頁(`pages/open.html`)。
- 儲存分工:使用者設定 → `chrome.storage.sync`(跨電腦);最近開過、貼上文字 → `chrome.storage.local`(只在本機,`core/library.js`)。
- **會被 DOMPurify 擋的網址(`obsidian://`)不能在解析階段產生**:解析只寫 `data-href` / `data-embed`,消毒後由 `core/obsidian.js` 依設定填入(改設定時即時重填)。
- **大型元件延遲載入**:Mermaid 只在文件有流程圖時載入 —— 一般網頁請背景管家 `chrome.scripting` 注入(`LAZY_SCRIPTS` 白名單),插件頁面直接加 `<script>`。
- **content script 注入的 CSS 不能用相對路徑載字型/圖片**(會對到網頁):`npm run sync` 把 KaTeX 字型網址改寫成 `chrome-extension://__MSG_@@extension_id__/…`,字型列在 `web_accessible_resources`。
- **Google Drive**:Google 已能自己排版一般 .md,Drive 按鈕定位是「看 Obsidian 語法」;原文用 `uc?export=download&id=` 由閱讀頁帶 Cookie 讀(`content/drive.js`、`MDR.driveUrl`)。
- **主題**:system / light / dark / sepia;系統深色色票只套在 `data-mdr-theme="system"`,新主題要照這個規則加。
- **新版本提示**:`chrome.storage.local.seenVersion`;安裝時記成目前版本,打開更新日誌時更新。
- **連結網址一律不能帶協定開頭**:雙中括號連結當相對路徑(`javascript:` 開頭補 `./`);新增任何「由文件內容產生網址」的功能,都要加進 `test-files/xss.md`。
- **屬性區**:`parseFrontmatter` 回傳 `{ data, strict }`;YAML 讀不懂時用寬鬆讀法並顯示提醒,不要只丟原文。
- 標籤規則照 Obsidian:`#` 前面必須是空白或行首(緊貼標點不算)。
- Chrome 最低版本 128(網路規則的 `responseHeaders` 條件)。

## 版本流程(PM 授權自行 commit、驗證、發布)

每版:實作 → `npm run sync` → `npm test` + `npm run test:vault` → 更新四份文件(CHANGELOG、checklist、TODO、PROGRESS)→ `git commit -m "v{版本}: 白話摘要"` → `npm run release`(zip 安裝包 + git tag)。

## 測試

- `npm test`:Chrome for Testing 載入插件跑自動化測試,結果寫進 `tests/output/e2e-results.md`,截圖在 `tests/output/`。
- `npm run test:vault`:用 PM 的 Obsidian 知識庫(預設 `~/Obsidian/LLM Wiki/wiki`)挑 20 篇真實筆記驗收;筆記只在本機讀,結果在 `tests/output/vault/`(不進版控)。
- 啟動載入插件的測試瀏覽器:`tests/lib/launch.mjs`(兩套測試共用)。
- 用插件**名稱**找背景程式(Chrome 內建元件擴充也有叫 `background.js` 的背景程式)。
- 下載測試要先用 CDP `Browser.setDownloadBehavior` 改回正常行為,否則 Playwright 會把檔名改成 GUID。
- Playwright 的 `context.route` 攔不到插件頁面(viewer)的請求:Drive 頁面用模擬,閱讀頁下載打真正的 Google(公開 PDF 測成功、假編號測 404)。
- 登入後的 Google Drive、Windows、真實 Chrome 的通知需人工測試,見 `docs/verification/`。
