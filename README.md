# 📖 MD隨手讀

Chrome 插件:.md 檔不管來自**電腦本機、網路網址、下載、Google Drive**,打開就是排版好的 Obsidian 風閱讀畫面。只讀、自用、不上架。

目前版本:**v0.4.0**(看得懂 Obsidian 筆記、流程圖、數學公式)。手動驗收步驟見 `docs/verification/v0.4.0-checklist.md`。

## 安裝(載入未封裝)

1. Chrome 網址列輸入 `chrome://extensions`
2. 右上角打開 **開發人員模式**
3. 按 **載入未封裝項目**,選這個專案裡的 `extension/` 資料夾
4. 在「MD隨手讀」的 **詳細資料** 裡確認 **允許存取檔案網址** 是開的(看本機 .md 需要)

改了程式之後,在 `chrome://extensions` 按「MD隨手讀」卡片上的 🔄 重新載入。

## 專案結構

```
extension/        插件本體(直接載入 Chrome,不需建置)
  manifest.json   插件身分證
  background.js   背景管家:安裝引導、右鍵選單、下載處理、打開設定頁
  CHANGELOG.md    更新日誌(由 npm run sync 從 docs/ 複製,設定頁顯示用)
  content/        頁面小程式:inplace.js 就地排版、drive-probe.js Drive 診斷(第 0 期)
  core/           排版引擎:detect.js 辨識、settings.js 設定、library.js 最近開過與貼上暫存、
                  syntax.js 擴充語法解析、obsidian.js Obsidian 加工、render.js 轉換+消毒、diagram.js 流程圖、reader.js 閱讀畫面
  pages/          閱讀頁 viewer、小視窗 popup、開啟檔案 open、設定頁 options、權限引導頁 onboarding
  rules/          網路規則:讓強制下載的 .md 直接顯示
  styles/         閱讀畫面樣式
  vendor/         第三方元件(markdown-it 與外掛、DOMPurify、highlight.js、js-yaml、KaTeX、Mermaid)
test-files/       測試用 .md(含惡意範例)
scripts/          開發工具(同步元件與更新日誌、產生圖示)
tests/            自動化測試(e2e.mjs)、真實筆記驗收(vault-check.mjs)
docs/             計劃書、變更紀錄、驗收清單、進度
```

## 開發指令

```bash
npm install          # 安裝開發工具(只有開發需要,插件本身不用)
npm run sync         # 第三方元件 → extension/vendor/;CHANGELOG → extension/(改了更新日誌一定要跑)
npm run icons        # 重新產生圖示
npm test             # 自動化測試(Chrome for Testing 載入插件跑 57 項)
npm run test:vault   # 真實筆記驗收(從 Obsidian 知識庫挑 20 篇,MDR_VAULT 可指定路徑)
npm run release      # 發布:打包 dist/md-suishoudu-v{版本}.zip + 建 git 版本標記(先 commit)
```
