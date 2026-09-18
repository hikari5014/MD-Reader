// 把插件需要、但來源在別處的檔案複製進 extension/:
//   1. 第三方元件(Manifest V3 不允許從網路載入程式,要打包在插件裡)
//   2. 更新日誌 docs/changelog/CHANGELOG.md → extension/CHANGELOG.md(設定頁顯示用)
// 用法:npm run sync   (改了 CHANGELOG 或升級元件後都要跑)
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'extension', 'vendor');
const libs = [
  { pkg: 'markdown-it', file: 'dist/markdown-it.min.js', out: 'markdown-it.min.js', license: 'MIT' },
  { pkg: 'dompurify', file: 'dist/purify.min.js', out: 'purify.min.js', license: 'Apache-2.0 / MPL-2.0' },
  { pkg: '@highlightjs/cdn-assets', file: 'highlight.min.js', out: 'highlight.min.js', license: 'BSD-3-Clause' },
];

const rows = libs.map(({ pkg, file, out, license }) => {
  copyFileSync(join(root, 'node_modules', pkg, file), join(vendor, out));
  const { version } = JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8'));
  return `| ${out} | ${pkg} | ${version} | ${license} |`;
});
writeFileSync(join(vendor, 'VERSIONS.md'),
  `# 第三方元件版本\n\n由 \`npm run sync\` 產生,請勿手改。\n\n| 檔案 | 套件 | 版本 | 授權 |\n|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(rows.join('\n'));

copyFileSync(join(root, 'docs', 'changelog', 'CHANGELOG.md'), join(root, 'extension', 'CHANGELOG.md'));
console.log('CHANGELOG.md → extension/CHANGELOG.md');
