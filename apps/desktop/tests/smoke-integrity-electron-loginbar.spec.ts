import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLoginBarHtml } from '../src/main/loginWindowBar';

test.describe('L3 Real Electron Login Bar Controls', () => {
  test('真 Electron WebContentsView 加载顶栏 HTML：点击后退/刷新/关闭及连点两次均触发对应 action（无完成按钮）', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-l3-loginbar-'));
    const entryMain = path.resolve(__dirname, '../out/main/index.js');
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    cleanEnv.VMARK_USER_DATA_DIR = tmpUserData;

    const electronApp = await electron.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', entryMain],
      env: cleanEnv,
    });

    try {
      await electronApp.firstWindow();
      const html = buildLoginBarHtml({ platformId: 'weixin', signedInAtOpen: false });
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

      const titles = await electronApp.evaluate(async ({ BrowserWindow, WebContentsView }, url) => {
        const win = new BrowserWindow({ width: 900, height: 200, show: false });
        const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false } });
        win.contentView.addChildView(view);
        view.setBounds({ x: 0, y: 0, width: 900, height: 52 });

        const received: string[] = [];
        view.webContents.on('page-title-updated', (_e, title) => {
          received.push(title);
        });

        await view.webContents.loadURL(url);
        const result = await view.webContents.executeJavaScript(`(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const hasDone = btns.some((b) => (b.textContent || '').includes('完成'));
          btns.forEach((b) => b.click());
          btns[1]?.click();
          return { buttonCount: btns.length, hasDone };
        })()`);
        await new Promise((r) => setTimeout(r, 150));

        if (!view.webContents.isDestroyed()) view.webContents.close();
        if (!win.isDestroyed()) win.destroy();
        return { received, ...result };
      }, dataUrl);

      expect(titles.buttonCount).toBe(3);
      expect(titles.hasDone).toBe(false);
      expect(titles.received).toHaveLength(4);
      expect(titles.received[0]).toMatch(/^vmark-nav:\/\/back:\d+$/);
      expect(titles.received[1]).toMatch(/^vmark-nav:\/\/reload:\d+$/);
      expect(titles.received[2]).toMatch(/^vmark-nav:\/\/close:\d+$/);
      expect(titles.received[3]).toMatch(/^vmark-nav:\/\/reload:\d+$/);
    } finally {
      await electronApp.close().catch(() => {});
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    }
  });
});
