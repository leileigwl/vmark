import path from 'node:path';
import { expect, test } from '@playwright/test';
import { LOGIN_BAR_HEIGHT, buildLoginBarHtml } from '../src/main/loginWindowBar';

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1120, 720]) {
    test(`登录窗口顶栏（${scheme}，${width}px）：按钮完整可点，≥ 36px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: LOGIN_BAR_HEIGHT });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setContent(buildLoginBarHtml({ platformId: 'xiaohongshu', signedInAtOpen: false }));
      const done = page.getByRole('button', { name: '登录完成' });
      await expect(done).toBeVisible();
      await expect(page.getByRole('button', { name: '关闭' })).toBeVisible();
      for (const b of await page.getByRole('button').all()) {
        const box = await b.boundingBox();
        expect(box && box.height >= 36 && box.x >= 0 && box.x + box.width <= width).toBe(true);
        expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      const dir = process.env.PW_SCREENSHOT_DIR;
      const name = `simplify-login-bar-${scheme}-${width}.png`;
      await page.screenshot({ path: dir ? path.join(dir, name) : testInfo.outputPath(name) });
    });
  }
}
