// 擴充語法(解析階段):markdown-it 外掛 + 前處理
//   [[筆記]]、[[筆記|別名]]、[[筆記#段落]]、![[嵌入]]、$數學$、$$數學$$、%%註解%%、--- 屬性區 ---
// 這裡只產生「待加工」的標記(data-href / data-embed),真正的連結網址在消毒之後才由 obsidian.js 設定
(() => {
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

  function splitTarget(target) {
    const i = target.indexOf('#');
    return i < 0 ? [target, ''] : [target.slice(0, i), target.slice(i + 1)];
  }
  // 顯示文字:筆記 / 筆記 > 段落 / 段落
  function displayOf(target) {
    const [page, sub] = splitTarget(target);
    const name = page.split('/').pop().replace(/\.md$/i, '');
    if (!sub) return name;
    const s = sub.replace(/^\^/, '');
    return name ? `${name} > ${s}` : s;
  }

  function wikilinkPlugin(md) {
    const esc = md.utils.escapeHtml;
    md.inline.ruler.before('link', 'wikilink', (state, silent) => {
      const src = state.src;
      let pos = state.pos;
      const embed = src.charCodeAt(pos) === 0x21; // !
      if (embed) pos++;
      if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false; // [[
      const end = src.indexOf(']]', pos + 2);
      if (end < 0) return false;
      const inner = src.slice(pos + 2, end);
      if (!inner.trim() || inner.includes('\n') || inner.includes('[[')) return false;
      if (!silent) {
        const sep = inner.search(/\\?\|/); // 表格裡要寫成 \|
        const token = state.push(embed ? 'wiki_embed' : 'wikilink', '', 0);
        token.meta = {
          target: (sep < 0 ? inner : inner.slice(0, sep)).trim(),
          alias: sep < 0 ? '' : inner.slice(sep).replace(/^\\?\|/, '').trim(),
        };
      }
      state.pos = end + 2;
      return true;
    });

    md.renderer.rules.wikilink = (tokens, i) => {
      const { target, alias } = tokens[i].meta;
      return `<a class="internal-link" data-href="${esc(target)}" title="${esc(`[[${target}]]`)}">${esc(alias || displayOf(target))}</a>`;
    };
    md.renderer.rules.wiki_embed = (tokens, i) => {
      const { target, alias } = tokens[i].meta;
      const [file] = splitTarget(target);
      if (IMAGE_EXT.test(file)) {
        const size = alias.match(/^(\d+)(?:x(\d+))?$/); // ![[圖.png|300]] 或 |300x200
        const dims = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ''}` : '';
        return `<img class="mdr-embed-img" data-embed="${esc(file)}" alt="${esc(size ? file : alias || file)}"${dims}>`;
      }
      return `<a class="internal-link mdr-embed-note" data-href="${esc(target)}" title="${esc(`![[${target}]]`)}">${esc(alias || displayOf(target))}</a>`;
    };
  }

  // ---------- 數學公式:$行內$、$$區塊$$(用 KaTeX 排版)----------
  function tex(content, displayMode, esc) {
    if (!globalThis.katex) return `<code>${esc(content)}</code>`;
    return globalThis.katex.renderToString(content, { displayMode, throwOnError: false, output: 'htmlAndMathml' });
  }

  function mathPlugin(md) {
    const esc = md.utils.escapeHtml;
    md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
      const src = state.src;
      const start = state.pos;
      if (src[start] !== '$') return false;
      if (src[start + 1] === '$') { // 段落中的 $$…$$
        const end = src.indexOf('$$', start + 2);
        if (end < 0 || end === start + 2) return false;
        if (!silent) state.push('math_display', '', 0).content = src.slice(start + 2, end);
        state.pos = end + 2;
        return true;
      }
      // $…$:開頭 $ 後不能是空白,結尾 $ 前不能是空白、後面不能接數字(避免 $5 和 $10 被當公式)
      if (!src[start + 1] || /\s/.test(src[start + 1])) return false;
      let end = start + 1;
      while ((end = src.indexOf('$', end)) !== -1 && src[end - 1] === '\\') end++;
      if (end === -1 || /\s/.test(src[end - 1]) || /\d/.test(src[end + 1] || '')) return false;
      if (!silent) state.push('math_inline', '', 0).content = src.slice(start + 1, end);
      state.pos = end + 1;
      return true;
    });

    md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
      const begin = state.bMarks[startLine] + state.tShift[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      if (state.src.slice(begin, begin + 2) !== '$$') return false;
      const first = state.src.slice(begin + 2, state.eMarks[startLine]).trim();
      let content = first;
      let line = startLine; // 結尾 $$ 所在的那一行
      let closed = first.endsWith('$$'); // 同一行就結束:$$x^2$$
      if (closed) content = first.slice(0, -2);
      while (!closed && ++line < endLine) {
        const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
        closed = text.trim().endsWith('$$');
        content += `\n${closed ? text.trim().slice(0, -2) : text}`;
      }
      if (!closed) return false;
      if (silent) return true;
      state.line = line + 1;
      const token = state.push('math_block', '', 0);
      token.block = true;
      token.content = content.trim();
      token.map = [startLine, state.line];
      return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

    md.renderer.rules.math_inline = (t, i) => tex(t[i].content, false, esc);
    md.renderer.rules.math_display = (t, i) => `<span class="mdr-math-display">${tex(t[i].content, true, esc)}</span>`;
    md.renderer.rules.math_block = (t, i) => `<div class="mdr-math-block">${tex(t[i].content, true, esc)}</div>\n`;
  }

  // ---------- 前處理 ----------
  // %%Obsidian 註解%% 不顯示(程式碼區塊裡的不動)
  function stripComments(text) {
    if (!text.includes('%%')) return text;
    const FENCE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
    const strip = (s) => s.replace(/%%[\s\S]*?%%/g, '');
    let out = '';
    let last = 0;
    for (const m of text.matchAll(FENCE)) {
      out += strip(text.slice(last, m.index)) + m[0];
      last = m.index + m[0].length;
    }
    return out + strip(text.slice(last));
  }

  // 檔案開頭的 --- 屬性區 ---:拆出來另外顯示成屬性表
  function splitFrontmatter(text) {
    const m = text.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    return m ? { body: text.slice(m[0].length), raw: m[1] } : { body: text, raw: null };
  }
  // 回傳 { data, strict }:strict=false 代表格式不標準(Obsidian 也會說屬性無效),改用寬鬆讀法盡量讀出來
  function parseFrontmatter(raw) {
    try {
      const data = globalThis.jsyaml.load(raw, { schema: globalThis.jsyaml.CORE_SCHEMA }); // 不把日期轉成時間物件
      if (data && typeof data === 'object' && !Array.isArray(data)) return { data, strict: true };
    } catch { /* 交給寬鬆讀法 */ }
    const data = parseLoose(raw);
    return data ? { data, strict: false } : null;
  }

  // 寬鬆讀法:只認「名稱: 值」與底下的「- 項目」,值一律當文字(例如 related: [[A]], [[B]])
  function parseLoose(raw) {
    const data = {};
    const unquote = (v) => v.trim().replace(/^(["'])(.*)\1$/, '$2');
    let key = null;
    for (const line of raw.split(/\r?\n/)) {
      const kv = line.match(/^([^\s:#-][^:]*):(?:\s+(.*))?$/);
      if (kv) {
        key = kv[1].trim();
        const v = kv[2]?.trim() || '';
        const list = v.match(/^\[([^[].*)\]$/); // [a, b] 這種行內清單
        data[key] = list ? list[1].split(',').map(unquote).filter(Boolean) : v ? unquote(v) : null;
        continue;
      }
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item && key) data[key] = [...(Array.isArray(data[key]) ? data[key] : []), unquote(item[1])];
    }
    return Object.keys(data).length ? data : null;
  }

  function syntaxPlugin(md) {
    wikilinkPlugin(md);
    mathPlugin(md);
  }

  globalThis.MDR = Object.assign(globalThis.MDR || {}, { syntaxPlugin, stripComments, splitFrontmatter, parseFrontmatter, splitTarget, displayOf });
})();
