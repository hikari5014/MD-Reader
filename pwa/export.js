// 分享 / 匯出:Markdown 原始碼、整頁圖片(PNG)、PDF(列印)、Word(.doc)、Google 文件
// 原則:能用手機的分享選單就用;分享被瀏覽器擋下(桌機 Chrome 常見)就自動改成下載,不讓使用者卡住
(() => {
  const BASE_NAME = (name) => name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') || '文件';

  // ---------- 分享 / 下載 ----------
  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  // 回傳 'shared' | 'downloaded';使用者自己取消回傳 'cancelled'
  async function shareOrDownload(file) {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled'; // 使用者按了取消
        // 桌機 Chrome 常見 NotAllowedError(Permission denied):改成下載
      }
    }
    download(file);
    return 'downloaded';
  }

  // ---------- 1. Markdown 原始碼 ----------
  const markdownFile = (doc) => new File([doc.text], `${BASE_NAME(doc.name)}.md`, { type: 'text/markdown' });

  // ---------- 2. 整頁圖片(PNG)----------
  let imageLib = null;
  function loadImageLib() {
    return (imageLib ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('vendor/html-to-image.js'); // 用到才載入
      s.onload = () => resolve(globalThis.htmlToImage);
      s.onerror = () => { imageLib = null; reject(new Error('載入截圖元件失敗(沒有網路,而且之前沒用過這個功能)')); };
      document.head.append(s);
    }));
  }
  // 圖示字型要親手嵌進圖片:ui.css 裡還有一條指向插件網址(在網站上載不到)的同名字型,
  // 截圖元件會被它干擾,圖示就會變成「ec」「lo」這種被裁掉的英文字
  let iconFaceCss = null;
  async function iconFontFace() {
    if (iconFaceCss) return iconFaceCss;
    const url = chrome.runtime.getURL('vendor/material-symbols/material-symbols-rounded.woff2');
    const buf = await (await fetch(url)).arrayBuffer();
    let binary = '';
    for (const b of new Uint8Array(buf)) binary += String.fromCharCode(b);
    iconFaceCss = `@font-face{font-family:"MDR Symbols";font-weight:100 700;font-display:block;src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2")}`;
    return iconFaceCss;
  }

  async function pngFile(doc) {
    const lib = await loadImageLib();
    const body = document.querySelector('.mdr-body');
    if (!body) throw new Error('找不到內容');
    const style = getComputedStyle(document.documentElement);
    // 自己算的字型放最後:同名字型以後宣告的為準
    const fontEmbedCSS = (await lib.getFontEmbedCSS(body).catch(() => '')) + (await iconFontFace());
    const blob = await lib.toBlob(body, {
      fontEmbedCSS,
      backgroundColor: style.getPropertyValue('--mdr-bg').trim() || '#ffffff',
      pixelRatio: Math.min(2, globalThis.devicePixelRatio || 1), // 太大的圖 iPhone 會記憶體不足
      style: { margin: '0', padding: '24px' },
      filter: (node) => !node.classList?.contains('mdr-ripple-box'),
    });
    if (!blob) throw new Error('圖片產生失敗');
    return new File([blob], `${BASE_NAME(doc.name)}.png`, { type: 'image/png' });
  }

  // ---------- 3. PDF:交給瀏覽器列印(可選「儲存為 PDF」,文字可複製、會自動分頁)----------
  function printDocument() {
    document.documentElement.classList.add('is-printing');
    globalThis.print();
    setTimeout(() => document.documentElement.classList.remove('is-printing'), 1000);
  }

  // ---------- 4 & 5. 乾淨 HTML(給 Word 與 Google 文件用)----------
  // 閱讀畫面的 HTML 有很多只有本 App 看得懂的東西,先換成 Word / Google 文件看得懂的寫法
  function toPlainHtml(doc) {
    const source = document.querySelector('.mdr-body');
    if (!source) throw new Error('找不到內容');
    const body = source.cloneNode(true);
    // 畫面上藏起來的東西(例如關掉的屬性表)不要匯出
    body.querySelectorAll('[hidden]').forEach((n) => n.remove());
    // 提示框(可收合或不可收合)→ 引言區塊
    body.querySelectorAll('.callout').forEach((d) => {
      const quote = document.createElement('blockquote');
      const title = d.querySelector('.callout-title-inner')?.textContent.trim();
      if (title) {
        const b = document.createElement('p');
        b.innerHTML = `<b>${title.replace(/[<>&]/g, '')}</b>`;
        quote.append(b);
      }
      d.querySelectorAll('.callout-content > *').forEach((c) => quote.append(c.cloneNode(true)));
      d.replaceWith(quote);
    });
    // 數學公式 → 原本的 LaTeX 文字
    body.querySelectorAll('.katex').forEach((k) => {
      const tex = k.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      k.replaceWith(document.createTextNode(tex ? `$${tex}$` : k.textContent));
    });
    // 流程圖(SVG)→ 說明文字(Word、Google 文件讀不懂內嵌 SVG)
    body.querySelectorAll('.mdr-mermaid').forEach((m) => {
      const p = document.createElement('p');
      p.innerHTML = '<i>(流程圖:請用 MD隨手讀 或匯出圖片檢視)</i>';
      m.replaceWith(p);
    });
    // 介面裝飾、互動元素不要帶進文件
    body.querySelectorAll('.mdr-ripple-box, .mdr-props-raw').forEach((n) => n.remove());
    body.querySelectorAll('[class]').forEach((n) => n.removeAttribute('class'));
    body.querySelectorAll('[data-icon], [aria-hidden="true"]').forEach((n) => { if (!n.textContent.trim()) n.remove(); });
    const title = BASE_NAME(doc.name);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, '')}</title><style>
body { font-family: "PingFang TC", "Microsoft JhengHei", -apple-system, sans-serif; font-size: 12pt; line-height: 1.7; color: #222; }
h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 14pt; }
table { border-collapse: collapse; } th, td { border: 1px solid #999; padding: 4pt 8pt; }
pre { background: #f4f4f6; padding: 8pt; border: 1px solid #ddd; white-space: pre-wrap; font-family: Menlo, Consolas, monospace; font-size: 10.5pt; }
code { font-family: Menlo, Consolas, monospace; font-size: 10.5pt; }
blockquote { margin: 8pt 0; padding: 4pt 12pt; border-left: 3pt solid #7c5cff; background: #f6f4ff; }
img { max-width: 100%; }
</style></head><body>${body.innerHTML}</body></html>`;
  }
  // Word:HTML 格式的 .doc,Word、Pages、Google 文件都打得開
  const wordFile = (doc) => new File([toPlainHtml(doc)], `${BASE_NAME(doc.name)}.doc`, { type: 'application/msword' });

  // ---------- 5. 存成 Google 文件(上傳到雲端硬碟並轉成 Google 文件格式)----------
  const toGoogleDoc = (doc) => PWA_DRIVE.uploadAsGoogleDoc(BASE_NAME(doc.name), toPlainHtml(doc));

  globalThis.PWA_EXPORT = { shareOrDownload, download, markdownFile, pngFile, wordFile, printDocument, toPlainHtml, toGoogleDoc, iconFontFace };
})();
