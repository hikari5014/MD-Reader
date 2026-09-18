// 真實筆記驗收:從 Obsidian 知識庫挑 20 篇筆記,用插件排版後檢查有沒有沒處理到的語法
// 用法:npm run test:vault            (預設 ~/Obsidian/LLM Wiki/wiki、20 篇)
//       MDR_VAULT=/路徑 MDR_VAULT_COUNT=100 npm run test:vault
// 筆記只在本機讀取,結果與截圖寫在 tests/output/(不進版本控制)
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchWithExtension } from './lib/launch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'tests', 'output', 'vault');
const VAULT = process.env.MDR_VAULT || join(homedir(), 'Obsidian', 'LLM Wiki', 'wiki');
const COUNT = Number(process.env.MDR_VAULT_COUNT) || 20;
if (!existsSync(VAULT)) {
  console.log(`找不到知識庫:${VAULT}(可用 MDR_VAULT 指定),略過`);
  process.exit(0);
}

// ---------- 挑筆記:用到特殊語法的優先,其餘用固定亂數補滿(每次挑到的一樣)----------
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name.endsWith('.md') ? [full] : [];
  });
}
const notes = walk(VAULT).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
const FEATURES = {
  callout: /^> ?\[!/m,
  math: /\$\$|\$[^\s$][^$\n]*[^\s$]\$/,
  embed: /!\[\[/,
  mermaid: /```mermaid/,
  highlight: /==[^=\n]+==/,
  table: /^\|.*\|\s*$/m,
};
const picked = new Map();
for (const re of Object.values(FEATURES)) {
  notes.filter((n) => re.test(n.text)).slice(0, 4).forEach((n) => picked.size < COUNT && picked.set(n.file, n));
}
let seed = 20260918;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const rest = notes.filter((n) => !picked.has(n.file)).sort(() => rand() - 0.5);
while (picked.size < COUNT && rest.length) { const n = rest.pop(); picked.set(n.file, n); }

// ---------- 逐篇排版檢查 ----------
mkdirSync(OUTPUT, { recursive: true });
const { context, close } = await launchWithExtension({ extensionDir: join(ROOT, 'extension'), tmpDir: join(ROOT, 'tests', '.tmp-vault') });
const rows = [];
let i = 0;
for (const { file, text } of picked.values()) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1300, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  if (FEATURES.mermaid.test(text)) await page.waitForSelector('.mdr-mermaid svg, .mdr-mermaid.is-error', { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const article = document.querySelector('.mdr-body');
    if (!article) return { rendered: false };
    // 把程式碼、屬性原文拿掉之後,還看得到的 Obsidian 原始符號就是「沒處理到」
    const clone = article.cloneNode(true);
    clone.querySelectorAll('pre, code, .mdr-props-raw, .katex').forEach((e) => e.remove());
    const t = clone.textContent;
    return {
      rendered: document.documentElement.dataset.mdr === 'rendered',
      props: article.querySelector('.mdr-props') ? (article.querySelector('.mdr-props-raw') ? '⚠️ 原文' : '✅') : '—',
      links: article.querySelectorAll('a.internal-link').length,
      callouts: article.querySelectorAll('.callout').length,
      math: article.querySelectorAll('.katex').length,
      mermaid: article.querySelectorAll('.mdr-mermaid svg').length,
      // 只算 Obsidian 會處理、我們卻沒處理的寫法(空的 [[]]、單獨的 === 這類 Obsidian 也原樣顯示,不算)
      leftovers: [[/\[\[[^\]\s][^\]\n]*\]\]/, '[[連結]]'], [/\[![\w-]+\]/, '[!提示框]'], [/%%/, '%%註解%%'], [/(^|[^=])==[^=\s][^=\n]*[^=\s]==(?!=)/, '==螢光筆==']]
        .filter(([re]) => re.test(t)).map(([, name]) => name),
      looseProps: !!article.querySelector('.mdr-props-note'),
      missingImages: [...article.querySelectorAll('.mdr-embed-missing')].map((e) => e.textContent.replace('🖼 找不到圖片:', '')),
      mathErrors: article.querySelectorAll('.katex-error').length,
    };
  });
  const hasFrontmatter = /^---\r?\n/.test(text);
  const problems = [
    !r.rendered && '沒有排版',
    r.rendered && hasFrontmatter && r.props === '—' && '屬性區沒變成屬性表',
    r.props === '⚠️ 原文' && '屬性區完全讀不懂',
    r.leftovers?.length && `殘留符號 ${r.leftovers.join(' ')}`,
    r.mathErrors && `${r.mathErrors} 個公式錯誤`,
    errors.length && `程式錯誤:${errors[0]}`,
  ].filter(Boolean);
  if (i < 6 || FEATURES.embed.test(text)) await page.screenshot({ path: join(OUTPUT, `note-${String(i + 1).padStart(2, '0')}.png`) });
  rows.push({ file: relative(VAULT, file), ...r, problems, warnings: [...(r.missingImages || []).map((n) => `找不到圖 ${n}`), ...(r.looseProps ? ['屬性格式不標準(Obsidian 也會說無效),已盡量讀出'] : [])] });
  i++;
  await page.close();
}
await close();

// ---------- 報告 ----------
const fail = rows.filter((r) => r.problems.length).length;
const lines = [
  `# 真實筆記驗收(${new Date().toLocaleString('zh-TW')})`, '',
  `- 知識庫:${VAULT}(共 ${notes.length} 篇,挑 ${rows.length} 篇)`,
  `- 合計:屬性表 ${rows.filter((r) => r.props === '✅').length} 篇、雙中括號連結 ${rows.reduce((n, r) => n + (r.links || 0), 0)} 個、提示框 ${rows.reduce((n, r) => n + (r.callouts || 0), 0)} 個、公式 ${rows.reduce((n, r) => n + (r.math || 0), 0)} 個、流程圖 ${rows.reduce((n, r) => n + (r.mermaid || 0), 0)} 張;需要注意 ${rows.filter((r) => r.warnings.length).length} 篇`,
  `- 結果:**${rows.length - fail} 篇正常 / ${fail} 篇有問題**`, '',
  '| # | 筆記 | 屬性表 | 連結 | 提示框 | 公式 | 流程圖 | 結果 |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r, k) => `| ${k + 1} | ${r.file} | ${r.props} | ${r.links} | ${r.callouts} | ${r.math} | ${r.mermaid} | ${r.problems.length ? `❌ ${r.problems.join(';')}` : '✅'}${r.warnings.length ? `(⚠️ ${r.warnings.join('、')})` : ''} |`),
];
writeFileSync(join(OUTPUT, 'vault-results.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(fail ? 1 : 0);
