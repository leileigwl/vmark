import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.describe('L3 Real Electron App Smoke', () => {
  test('Main <-> Preload <-> Renderer 完整 IPC 往返与冷启动渲染无白屏崩溃', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-l3-userdata-'));
    const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-l3-ws-'));
    fs.writeFileSync(
      path.join(tmpUserData, 'vcat-config.json'),
      JSON.stringify({
        workspacePath: tmpWorkspace,
        recentWorkspaces: [tmpWorkspace],
        imageBed: { strategy: 'platform_private' },
        startup: { mode: 'last_opened' },
      }),
      'utf8'
    );
    const entryMain = path.resolve(__dirname, '../out/main/index.js');

    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    cleanEnv.VMARK_USER_DATA_DIR = tmpUserData;

    const electronApp = await electron.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        entryMain,
      ],
      env: cleanEnv,
    });

    const pageErrors: string[] = [];
    try {
      const win = await electronApp.firstWindow();
      win.on('pageerror', (err) => pageErrors.push(err.message));

      await win.waitForLoadState('domcontentloaded');
      await expect(win.locator('#root')).not.toBeEmpty({ timeout: 15_000 });

      const apiPresent = await win.evaluate(() => {
        const api = (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI;
        return Boolean(
          api &&
            typeof api.switchWorkspace === 'function' &&
            typeof api.createArticle === 'function' &&
            typeof api.saveArticle === 'function' &&
            typeof api.readArticle === 'function' &&
            typeof api.getPlatformAuthStates === 'function' &&
            typeof api.getPlatformAccounts === 'function'
        );
      });
      expect(apiPresent).toBe(true);

      const roundTrip = await win.evaluate(async (wsDir: string) => {
        const api = window.electronAPI;
        const switched = await api.switchWorkspace(wsDir);
        const currentWs = await api.getWorkspacePath();
        const created = await api.createArticle('smoke.md');
        const expectedBody = '# L3 Electron Smoke\n\nReal IPC round-trip passed.\n';
        await api.saveArticle(created.relativePath, expectedBody);
        const readBack = await api.readArticle(created.relativePath);
        const listed = await api.listArticles();
        await api.saveStartupConfig({ mode: 'last_opened', lastArticlePath: created.relativePath });
        const startup = await api.getStartupConfig();
        const authStates = await api.getPlatformAuthStates();
        const accounts = await api.getPlatformAccounts?.();
        return {
          switched,
          currentWs,
          createdRel: created.relativePath,
          readBack,
          listedCount: listed.length,
          startupLast: startup.lastArticlePath,
          authStatesType: typeof authStates,
          accountsType: typeof accounts,
        };
      }, tmpWorkspace);

      expect(roundTrip.switched).toBe(tmpWorkspace);
      expect(roundTrip.currentWs).toBe(tmpWorkspace);
      expect(roundTrip.createdRel).toBe('smoke.md');
      expect(roundTrip.readBack).toContain('Real IPC round-trip passed.');
      expect(roundTrip.listedCount).toBe(1);
      expect(roundTrip.startupLast).toBe('smoke.md');
      expect(roundTrip.authStatesType).toBe('object');
      expect(roundTrip.accountsType).toBe('object');
      expect(pageErrors).toEqual([]);
    } finally {
      await electronApp.close().catch(() => {});
      fs.rmSync(tmpUserData, { recursive: true, force: true });
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    }
  });
});
