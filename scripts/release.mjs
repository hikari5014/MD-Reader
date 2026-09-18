// 發布:檢查版本號一致 → 打包 dist/md-suishoudu-v{版本}.zip → 建 git 版本標記
// 用法:npm run release   (先跑過 npm test、存好版本,工作區要乾淨)
// 安裝包用途:帶到別台電腦(例如 Windows)解壓縮後「載入未封裝項目」
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

const manifest = JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8')).version;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const changelog = readFileSync(join(root, 'docs', 'changelog', 'CHANGELOG.md'), 'utf8').match(/^## v(\d+\.\d+\.\d+)/m)?.[1];
if (manifest !== pkg || manifest !== changelog) fail(`版本號不一致:manifest ${manifest}、package ${pkg}、CHANGELOG ${changelog}`);
if (readFileSync(join(root, 'extension', 'CHANGELOG.md'), 'utf8') !== readFileSync(join(root, 'docs', 'changelog', 'CHANGELOG.md'), 'utf8')) fail('extension/CHANGELOG.md 過期,請先 npm run sync');
if (run('git', ['status', '--porcelain'])) fail('還有沒存進版本的修改,請先 commit');
const tag = `v${manifest}`;
if (run('git', ['tag', '--list', tag])) fail(`版本標記 ${tag} 已經存在`);

const dist = join(root, 'dist');
const zip = join(dist, `md-suishoudu-${tag}.zip`);
mkdirSync(dist, { recursive: true });
rmSync(zip, { force: true });
run('zip', ['-r', '-X', '-q', zip, '.', '-x', '_metadata/*', '*.DS_Store'], join(root, 'extension'));
run('git', ['tag', '-a', tag, '-m', `MD隨手讀 ${tag}`]);
const size = (readFileSync(zip).length / 1024 / 1024).toFixed(1);
console.log(`✓ ${tag} 已發布\n  安裝包:dist/md-suishoudu-${tag}.zip(${size} MB)\n  版本標記:${tag} → ${run('git', ['rev-parse', '--short', 'HEAD'])}`);
