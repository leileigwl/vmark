import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMockWorkspace } from './support/mockWorkspace';

/**
 * 顶栏跟随应用主题：在「偏好设置 → 外观主题」里切换后回到写作台，
 * 顶栏背景、按钮文字、「发布」主按钮都取当前主题的令牌，不留写死的系统蓝。
 */

async function pickTheme(page: Page, name: string, themeId: string) {
  await page.getByTitle('偏好设置 (图床 / 平台 / GitHub)').click();
  await page.getByRole('button', { name: '外观主题' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', themeId);
  await page.getByRole('button', { name: '← 返回写作台' }).click();
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible' });
  // 主题色有 transition，等它走完再取色。
  await page.waitForTimeout(500);
}

/** 读出顶栏实际颜色和当前主题令牌（令牌经浏览器解析成 rgb，便于直接比较）。 */
function readTopBar(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header')!;
    const resolve = (cssVar: string, prop: 'color' | 'backgroundColor') => {
      const probe = document.createElement('span');
      probe.style[prop] = `var(${cssVar})`;
      header.appendChild(probe);
      const v = getComputedStyle(probe)[prop];
      probe.remove();
      return v;
    };
    const publish = [...header.querySelectorAll('button')].find((b) => b.textContent?.includes('发布'))!;
    const sidebarToggle = header.querySelector('button[title$="侧边栏"]')!;
    return {
      headerBg: getComputedStyle(header).backgroundColor,
      publishBg: getComputedStyle(publish).backgroundColor,
      iconColor: getComputedStyle(sidebarToggle).color,
      tokens: {
        bgMain: resolve('--bg-main', 'backgroundColor'),
        accent: resolve('--accent', 'backgroundColor'),
        muted: resolve('--control-text-color', 'color'),
      },
    };
  });
}

const CASES = [
  { label: 'light', name: 'Bloom Amber 琥珀暖光', themeId: 'bloom-amber' },
  { label: 'dark', name: 'Bloom Amber Dark 琥珀暗夜', themeId: 'bloom-amber-dark' },
] as const;

for (const c of CASES) {
  test(`顶栏跟随应用主题（${c.label}：${c.themeId}）`, async ({ page }, testInfo) => {
    await installMockWorkspace(page, { files: { 'test.md': '# 标题\n\n正文\n' } });
    await page.goto('/');
    await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
    await pickTheme(page, c.name, c.themeId);

    const bar = await readTopBar(page);
    const dir = process.env.PW_SCREENSHOT_DIR;
    const shot = `topbar-${c.label}.png`;
    await page.locator('header').screenshot({ path: dir ? path.join(dir, shot) : testInfo.outputPath(shot) });

    expect(bar.headerBg, '顶栏背景取 --bg-main').toBe(bar.tokens.bgMain);
    expect(bar.iconColor, '顶栏图标取 --control-text-color').toBe(bar.tokens.muted);
    expect(bar.publishBg, '「发布」主按钮取主题 --accent，而不是写死的系统蓝').toBe(bar.tokens.accent);
  });
}

test('顶栏按钮可点区域不小于 28px 且「发布」按钮高度 ≥ 28px（顶栏 36px 内）', async ({ page }) => {
  await installMockWorkspace(page, { files: { 'test.md': '正文\n' } });
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
  for (const b of await page.locator('header button').all()) {
    const box = await b.boundingBox();
    expect(box && box.height >= 28 && box.width >= 28).toBe(true);
  }
});
