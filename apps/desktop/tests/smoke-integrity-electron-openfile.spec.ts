import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeEnv, waitForExit } from './support/integrityElectron';

test('双击唤起（冷启动 + 已运行时 open-file + macOS 关窗后重建）：直接打开目标文件并切换工作区，不闪现旧文件', async () => {
  const env = makeEnv('# Old Workspace\n\nold workspace text\n', 'old.md');
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-openfile-ext-'));
  const thirdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-openfile-3rd-'));
  const fourthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-openfile-4th-'));
  const coldFile = path.join(extDir, 'double-clicked.md');
  const warmFile = path.join(thirdDir, 'warm-opened.md');
  const dockFile = path.join(fourthDir, 'dock-reopened.md');
  fs.writeFileSync(coldFile, '# Double Clicked\n\nlaunched via cold open-file\n', 'utf8');
  fs.writeFileSync(warmFile, '# Warm Opened\n\nopened while already running\n', 'utf8');
  fs.writeFileSync(dockFile, '# Dock Reopened\n\nrecreated window on open-file\n', 'utf8');

  const cleanEnv: Record<string, string> = { VMARK_USER_DATA_DIR: env.userData };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') cleanEnv[k] = v;
  }
  cleanEnv.VMARK_USER_DATA_DIR = env.userData;

  const app = await electron.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      path.resolve(__dirname, '../out/main/index.js'),
      coldFile,
    ],
    env: cleanEnv,
  });

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 20_000 });

    // 1. Cold start must open double-clicked.md directly without landing on old.md
    await expect(win.locator('[data-article-path="double-clicked.md"]')).toBeVisible({ timeout: 10_000 });
    await expect(win.locator('.vditor-ir .vditor-reset')).toContainText('launched via cold open-file');
    await expect(win.locator('[data-article-path="old.md"]')).toHaveCount(0);

    // 2. Warm open-file event (simulating Finder double-click while running)
    await app.evaluate(({ app: electronApp }, targetPath) => {
      electronApp.emit('open-file', { preventDefault: () => {} } as Electron.Event, targetPath);
    }, warmFile);

    await expect(win.locator('[data-article-path="warm-opened.md"]')).toBeVisible({ timeout: 10_000 });
    await expect(win.locator('.vditor-ir .vditor-reset')).toContainText('opened while already running');

    // 3. macOS Dock-resident (all windows closed) -> open-file recreates window and opens dockFile
    if (process.platform === 'darwin') {
      await win.close();
      await expect.poll(
        async () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        { timeout: 5_000 }
      ).toBe(0);

      const nextWinPromise = app.waitForEvent('window');
      await app.evaluate(({ app: electronApp }, targetPath) => {
        electronApp.emit('open-file', { preventDefault: () => {} } as Electron.Event, targetPath);
      }, dockFile);
      const win2 = await nextWinPromise;
      await win2.waitForLoadState('domcontentloaded');
      await win2.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 20_000 });
      await expect(win2.locator('[data-article-path="dock-reopened.md"]')).toBeVisible({ timeout: 10_000 });
      await expect(win2.locator('.vditor-ir .vditor-reset')).toContainText('recreated window on open-file');
    }
  } finally {
    await Promise.race([app.close().catch(() => undefined), waitForExit(app, 5_000)]);
    env.cleanup();
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(thirdDir, { recursive: true, force: true });
    fs.rmSync(fourthDir, { recursive: true, force: true });
  }
});
