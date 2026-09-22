// 下載 Google Fonts 的 Material Symbols Rounded,只保留插件用到的圖示(子集),存進 extension/vendor/
// 用法:npm run icons:font   (新增圖示時,把名稱加進 ICONS 再跑一次;執行時不連網,字型打包在插件裡)
// 圖示一覽:https://fonts.google.com/icons?icon.style=Rounded
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICONS = [
  // 閱讀畫面工具列
  'toc', 'brightness_auto', 'light_mode', 'dark_mode', 'eyeglasses', 'code', 'article', 'print', 'settings',
  // 提示框(對應 Obsidian 的類型)
  'edit', 'summarize', 'info', 'check_circle', 'local_fire_department', 'check', 'help', 'warning', 'close', 'bolt', 'bug_report', 'list', 'format_quote',
  // 屬性表、收合、嵌入
  'chevron_right', 'expand_more', 'broken_image', 'description',
  // 小視窗、開啟檔案、引導頁
  'folder_open', 'content_paste', 'arrow_forward', 'history', 'menu_book', 'update', 'cloud', 'language', 'refresh', 'auto_stories', 'lightbulb', 'upload_file',
  'extension', 'toggle_on', 'lock_open',
  // 設定頁
  'palette', 'download', 'lock', 'restart_alt', 'notifications', 'block', 'open_in_new', 'delete', 'error',
  // iPhone 網頁 App(pwa/)
  'arrow_back', 'ios_share', 'search', 'format_size', 'tune', 'add_to_home_screen', 'logout', 'folder', 'text_increase', 'text_decrease', 'wifi_off', 'login', 'progress_activity',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'extension', 'vendor', 'material-symbols');
const names = [...new Set(ICONS)].sort(); // Google Fonts 要求依字母排序
const cssUrl = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
  + `&icon_names=${names.join(',')}&display=block`;
// 用 Chrome 的 User-Agent 才會拿到 woff2
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const css = await (await fetch(cssUrl, { headers: { 'user-agent': UA } })).text();
const fontUrl = css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1];
if (!fontUrl) throw new Error(`Google Fonts 沒有回傳 woff2:\n${css.slice(0, 500)}`);
const font = Buffer.from(await (await fetch(fontUrl, { headers: { 'user-agent': UA } })).arrayBuffer());
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'material-symbols-rounded.woff2'), font);
writeFileSync(join(out, 'ICONS.md'), `# Material Symbols Rounded(子集)\n\n由 \`npm run icons:font\` 產生,請勿手改。授權:Apache-2.0(Google)。\n\n${names.length} 個圖示:${names.join('、')}\n`);
console.log(`✓ ${names.length} 個圖示,${(font.length / 1024).toFixed(1)} KB → extension/vendor/material-symbols/`);
