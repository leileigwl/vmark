import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  LOGIN_BAR_HEIGHT,
  RENDERER_THEME_PROBE,
  buildLoginBarHtml,
  buildLoginBarThemeScript,
  buildRendererThemeWatch,
  resolveLoginBarTheme,
} from '../src/main/loginWindowBar';

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1120, 720]) {
    test(`登录窗口顶栏（${scheme}，${width}px）：按钮完整可点，≥ 36px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: LOGIN_BAR_HEIGHT });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setContent(buildLoginBarHtml({ platformId: 'xiaohongshu', signedInAtOpen: false }));
      await expect(page.getByRole('button', { name: '后退' })).toBeVisible();
      await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
      await expect(page.getByRole('button', { name: '关闭' })).toBeVisible();
      await expect(page.getByRole('button', { name: /完成/ })).toHaveCount(0);
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

// 顶栏跟随 app 内主题，而不是系统深浅色：两种情况都故意把系统设成与 app 相反。
const APP_THEMES = {
  'app-light': {
    os: 'dark',
    snapshot: {
      themeId: 'apple-light',
      tokens: { surface: '#fafafa', line: '#e5e5ea', ink: '#1d1d1f', muted: '#6e6e73', hover: '#eceef1', primary: '#007aff' },
    },
  },
  'app-dark': {
    os: 'light',
    snapshot: {
      themeId: 'bloom-ink-dark',
      tokens: { surface: '#232428', line: 'rgba(255, 255, 255, 0.12)', ink: '#e6e8eb', muted: '#9ba1a6', hover: 'rgba(255, 255, 255, 0.08)', primary: '#7f91a8' },
    },
  },
} as const;

const bodyLuminance = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0'];
    const [r, g, b] = m.slice(0, 3).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  });

for (const [name, { os, snapshot }] of Object.entries(APP_THEMES)) {
  test(`登录窗口顶栏跟随 app 主题（${name}，系统为 ${os}）`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1120, height: LOGIN_BAR_HEIGHT });
    await page.emulateMedia({ colorScheme: os });
    await page.setContent(buildLoginBarHtml({ platformId: 'xiaohongshu', signedInAtOpen: false, appTheme: snapshot }));
    const dir = process.env.PW_SCREENSHOT_DIR;
    await page.screenshot({ path: dir ? path.join(dir, `login-bar-${name}-os-${os}.png`) : testInfo.outputPath(`${name}.png`) });
    const lum = await bodyLuminance(page);
    if (name === 'app-dark') expect(lum).toBeLessThan(0.3);
    else expect(lum).toBeGreaterThan(0.7);
    const ink = await page.locator('.name').evaluate((el) => getComputedStyle(el).color);
    expect(ink).toBe(name === 'app-dark' ? 'rgb(230, 232, 235)' : 'rgb(29, 29, 31)');
  });
}

test('从真实 themes.css 读出的 app 主题能驱动顶栏（深色主题 + 系统浅色）', async ({ page }) => {
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/src/styles/themes.css'), 'utf-8');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setContent(`<html data-theme="bloom-sage-dark"><head><style>${css}</style></head><body></body></html>`);
  const snapshot = await page.evaluate(RENDERER_THEME_PROBE);
  await page.setViewportSize({ width: 720, height: LOGIN_BAR_HEIGHT });
  await page.setContent(buildLoginBarHtml({ platformId: 'zhihu', signedInAtOpen: true, appTheme: snapshot }));
  expect(await bodyLuminance(page)).toBeLessThan(0.3);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('#68ab7a');
});

test('登录窗口开着时切换 app 主题：顶栏由浅变深（真实 themes.css + 主进程用的监听/换色脚本）', async ({ browser }, testInfo) => {
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/src/styles/themes.css'), 'utf-8');
  const app = await browser.newPage();
  await app.setContent(`<html data-theme="apple-light"><head><style>${css}</style></head><body></body></html>`);
  const bar = await browser.newPage({ viewport: { width: 1120, height: LOGIN_BAR_HEIGHT } });
  await bar.setContent(
    buildLoginBarHtml({ platformId: 'xiaohongshu', signedInAtOpen: false, appTheme: await app.evaluate(RENDERER_THEME_PROBE) })
  );
  const dir = process.env.PW_SCREENSHOT_DIR;
  const shot = (n: string) => (dir ? path.join(dir, n) : testInfo.outputPath(n));
  await bar.screenshot({ path: shot('login-bar-live-1-light.png') });
  expect(await bodyLuminance(bar)).toBeGreaterThan(0.7);

  // 主进程在 Vmark 界面里挂一个监听，用户切主题后拿到新快照，再在顶栏里换色。
  const next = app.evaluate(buildRendererThemeWatch('apple-light'));
  await app.evaluate(() => document.documentElement.setAttribute('data-theme', 'bloom-lapis-dark'));
  const snapshot = await next;
  expect((snapshot as { themeId: string }).themeId).toBe('bloom-lapis-dark');
  await bar.evaluate(buildLoginBarThemeScript(resolveLoginBarTheme(snapshot)));
  await bar.screenshot({ path: shot('login-bar-live-2-dark.png') });
  expect(await bodyLuminance(bar)).toBeLessThan(0.3);
  expect(await bar.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('#5d94e2');
  await app.close();
  await bar.close();
});
