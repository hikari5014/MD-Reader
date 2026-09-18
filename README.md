# 📖 MD隨手讀

Chrome 插件:.md 檔不管來自**電腦本機、網路網址、下載、Google Drive**,打開就是排版好的 Obsidian 風閱讀畫面;看得懂 Obsidian 的屬性表、雙中括號連結、提示框、流程圖、數學公式。只讀、自用、不上架。

目前版本:**v1.1.0**(介面與互動重新設計)。發布總覽:`docs/plans/v1.0.0-plan.html`;使用說明:`docs/guide/GUIDE.md`(插件設定頁也看得到)。

## 安裝(載入未封裝)

1. Chrome 網址列輸入 `chrome://extensions`
2. 右上角打開 **開發人員模式**
3. 按 **載入未封裝項目**,選這個專案裡的 `extension/` 資料夾
   (別台電腦:解壓 `dist/md-suishoudu-v1.1.0.zip`,選解壓出來的資料夾)
4. 在「MD隨手讀」的 **詳細資料** 裡打開 **允許存取檔案網址**(看本機 .md 需要)
5. 建議:設定頁「閱讀」→「Obsidian 保險庫名稱」填 `LLM Wiki`,筆記裡的連結就能直接開 Obsidian

之後有新版本:在 `chrome://extensions` 按「MD隨手讀」卡片上的 🔄 重新載入。

## 功能

| 入口 | 說明 |
|---|---|
| 💻 本機 | 把 .md 拖進 Chrome 就排版(目錄、程式碼上色、勾選框、四種主題、進度條、列印) |
| 🌐 網路 | .md 網址自動排版;網站強制下載的也改成直接顯示 |
| 🖱️ 右鍵・小視窗 | .md 連結右鍵開啟;小視窗開檔、貼上文字或網址、最近開過 |
| ⬇️ 下載 | 下載完跳通知 / 自動開 / 不處理;Windows 把本機檔當下載時自動開原檔 |
| ☁️ Google Drive | 看到 .md 時右下角「📖 用 MD隨手讀 開啟」(給 Obsidian 語法用) |

設定頁:外觀、閱讀、下載、檔案權限、使用說明、更新日誌;設定會跨電腦同步。

## 專案結構

```
extension/        插件本體(直接載入 Chrome,不需建置)
  manifest.json   插件身分證
  background.js   背景管家:安裝引導、右鍵選單、下載處理、Drive 開檔、延遲載入元件
  CHANGELOG.md    更新日誌 ┐ 由 npm run sync 從 docs/ 複製,
  GUIDE.md        使用說明 ┘ 設定頁顯示用(不要直接改)
  content/        頁面小程式:inplace.js 就地排版、drive.js Google Drive 按鈕
  core/           排版引擎:detect 辨識、settings 設定、library 最近開過與暫存、
                  syntax 擴充語法解析、obsidian Obsidian 加工、render 轉換+消毒、
                  diagram 流程圖、reader 閱讀畫面
  pages/          閱讀頁 viewer、小視窗 popup、開啟檔案 open、設定頁 options、權限引導頁 onboarding
  rules/          網路規則:讓強制下載的 .md 直接顯示、補中文編碼
  styles/         ui.css 設計系統(圖示、動畫、按鈕)、reader.css 閱讀畫面(四種主題)、drive.css Drive 按鈕
  vendor/         第三方元件(版本見 vendor/VERSIONS.md)、material-symbols/ 圖示字型子集
docs/             plans 計劃書・changelog 更新日誌・verification 驗收清單・progress 進度・guide 使用說明
test-files/       測試用 .md(含惡意範例)
scripts/          sync 同步元件與文件、make-icons 產生圖示、release 發布
tests/            e2e.mjs 自動化測試、vault-check.mjs 真實筆記驗收、lib/ 共用
```

## 開發指令

```bash
npm install          # 安裝開發工具(只有開發需要,插件本身不用)
npm run sync         # 第三方元件 → extension/vendor/;CHANGELOG、GUIDE → extension/
npm run icons        # 重新產生插件圖示(PNG)
npm run icons:font   # 重新下載 Material Symbols 圖示字型(新增介面圖示時,先把名稱加進 scripts/fetch-icons.mjs)
npm test             # 自動化測試(Chrome for Testing 載入插件跑 80 項,其中 2 項需連網)
npm run test:vault   # 真實筆記驗收(預設 ~/Obsidian/LLM Wiki/wiki 挑 20 篇;MDR_VAULT、MDR_VAULT_COUNT 可調)
npm run release      # 發布:打包 dist/md-suishoudu-v{版本}.zip + 建 git 版本標記(先 commit)
```
