// 把插件需要、但來源在別處的檔案複製進 extension/:
//   1. 第三方元件(Manifest V3 不允許從網路載入程式,要打包在插件裡)
//   2. 更新日誌、使用說明 docs/ → extension/(設定頁顯示用)
// 用法:npm run sync   (改了 CHANGELOG 或升級元件後都要跑)
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const vendor = join(root, 'extension', 'vendor');
const version = (pkg) => JSON.parse(readFileSync(nm(pkg, 'package.json'), 'utf8')).version;

const libs = [
  { pkg: 'markdown-it', file: 'dist/markdown-it.min.js', out: 'markdown-it.min.js', license: 'MIT' },
  { pkg: 'markdown-it-mark', file: 'dist/markdown-it-mark.min.js', out: 'markdown-it-mark.min.js', license: 'MIT' },
  { pkg: 'markdown-it-footnote', file: 'dist/markdown-it-footnote.min.js', out: 'markdown-it-footnote.min.js', license: 'MIT' },
  { pkg: 'dompurify', file: 'dist/purify.min.js', out: 'purify.min.js', license: 'Apache-2.0 / MPL-2.0' },
  { pkg: '@highlightjs/cdn-assets', file: 'highlight.min.js', out: 'highlight.min.js', license: 'BSD-3-Clause' },
  { pkg: 'js-yaml', file: 'dist/js-yaml.min.js', out: 'js-yaml.min.js', license: 'MIT' },
  { pkg: 'katex', file: 'dist/katex.min.js', out: 'katex/katex.min.js', license: 'MIT' },
  { pkg: 'mermaid', file: 'dist/mermaid.min.js', out: 'mermaid.min.js', license: 'MIT' },
];

rmSync(join(vendor, 'katex'), { recursive: true, force: true });
mkdirSync(join(vendor, 'katex', 'fonts'), { recursive: true });
const rows = libs.map(({ pkg, file, out, license }) => {
  copyFileSync(nm(pkg, file), join(vendor, out));
  return `| ${out} | ${pkg} | ${version(pkg)} | ${license} |`;
});

// KaTeX 樣式:content script 注入的 CSS 裡,相對路徑會對到網頁而不是插件,
// 所以字型網址改成 chrome-extension://__MSG_@@extension_id__/…(Chrome 會自動換成插件 ID);只留 woff2
const css = readFileSync(nm('katex', 'dist', 'katex.min.css'), 'utf8')
  .replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, '')
  .replace(/url\(fonts\//g, 'url(chrome-extension://__MSG_@@extension_id__/vendor/katex/fonts/');
writeFileSync(join(vendor, 'katex', 'katex.min.css'), css);
for (const f of readdirSync(nm('katex', 'dist', 'fonts')).filter((f) => f.endsWith('.woff2'))) {
  copyFileSync(nm('katex', 'dist', 'fonts', f), join(vendor, 'katex', 'fonts', f));
}
rows.push(`| katex/katex.min.css + fonts/*.woff2 | katex | ${version('katex')} | MIT |`);
// iPhone 網頁 App(pwa/)用的 KaTeX 樣式:一般網站,字型用相對路徑指到插件的 vendor
mkdirSync(join(root, 'pwa', 'vendor'), { recursive: true });
writeFileSync(join(root, 'pwa', 'vendor', 'katex.min.css'),
  css.replaceAll('chrome-extension://__MSG_@@extension_id__/vendor/katex/fonts/', '../../extension/vendor/katex/fonts/'));

writeFileSync(join(vendor, 'VERSIONS.md'),
  `# 第三方元件版本\n\n由 \`npm run sync\` 產生,請勿手改。\n\n| 檔案 | 套件 | 版本 | 授權 |\n|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(rows.join('\n'));

copyFileSync(join(root, 'docs', 'changelog', 'CHANGELOG.md'), join(root, 'extension', 'CHANGELOG.md'));
copyFileSync(join(root, 'docs', 'guide', 'GUIDE.md'), join(root, 'extension', 'GUIDE.md'));
console.log('CHANGELOG.md、GUIDE.md → extension/');
