// 啟動「載入了 MD隨手讀 的 Chrome for Testing」,自動化測試與真實筆記驗收共用
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchWithExtension({ extensionDir, tmpDir, downloadsDir }) {
  const profile = join(tmpDir, 'profile');
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(profile, 'Default'), { recursive: true });
  if (downloadsDir) mkdirSync(downloadsDir, { recursive: true });
  writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({
    download: { default_directory: downloadsDir || tmpDir, prompt_for_download: false, directory_upgrade: true },
  }));
  const proc = spawn(chromium.executablePath(), [
    `--user-data-dir=${profile}`, `--load-extension=${extensionDir}`, `--disable-extensions-except=${extensionDir}`,
    '--remote-debugging-port=0', '--headless', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];

  // Chrome 內建的元件擴充也有背景程式(連檔名都叫 background.js),用插件名稱挑出我們的
  let sw = null;
  for (let i = 0; i < 75 && !sw; i++) {
    for (const w of context.serviceWorkers()) {
      const name = await w.evaluate(() => chrome.runtime.getManifest().name).catch(() => null);
      if (name === 'MD隨手讀') sw = w;
    }
    if (!sw) await sleep(200);
  }
  if (!sw) throw new Error('找不到 MD隨手讀 的背景程式,插件可能載入失敗');

  // Playwright 會把下載檔改成亂碼檔名,改回 Chrome 的正常行為(保留原檔名)
  if (downloadsDir) {
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadsDir });
  }

  return {
    browser,
    context,
    sw,
    extId: new URL(sw.url()).host,
    close: async () => {
      await browser.close().catch(() => {});
      proc.kill();
    },
  };
}
