import path from 'node:path';
import { expect, test } from '@playwright/test';
import { installMockWorkspace } from './support/mockWorkspace';

/**
 * 引用块只有一条左侧强调竖线，且颜色来自主题令牌（--accent）。
 * Vditor 4.x 给 blockquote 加了自带的 ::before 竖线，和 Vmark 自己的左边框叠在一起，深色下尤其明显。
 */
const THEMES = [
  ['light', 'apple-light'],
  ['dark', 'bloom-ink-dark'],
  ['dark-amber', 'bloom-amber-dark'],
] as const;

for (const [label, themeId] of THEMES) {
  test(`引用块（${label}）：只有一条左侧竖线，颜色取主题 --accent`, async ({ page }, testInfo) => {
    await installMockWorkspace(page, { files: { 'quote.md': '# 引用\n\n> 这是一段引用文字\n> 第二行\n\n正文段落\n' } });
    await page.goto('/');
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), themeId);
    const quote = page.locator('.vditor-reset blockquote').first();
    await quote.waitFor({ state: 'visible', timeout: 15_000 });
    // 主题切换有 transition，等颜色稳定。
    await page.waitForTimeout(400);

    const bars = await quote.evaluate((el) => {
      const isVisibleColor = (c: string) => !/^rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent';
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const beforeBar =
        before.content !== 'none' &&
        before.display !== 'none' &&
        parseFloat(before.width) > 0 &&
        isVisibleColor(before.backgroundColor);
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent)';
      document.body.appendChild(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return {
        leftBorder: parseFloat(cs.borderLeftWidth) > 0 && isVisibleColor(cs.borderLeftColor),
        leftBorderColor: cs.borderLeftColor,
        beforeBar,
        accent,
      };
    });

    const dir = process.env.PW_SCREENSHOT_DIR;
    const shot = `blockquote-${label}.png`;
    await page.locator('.vditor-ir').screenshot({ path: dir ? path.join(dir, shot) : testInfo.outputPath(shot) });

    expect(Number(bars.leftBorder) + Number(bars.beforeBar), '引用块左侧应只有一条竖线').toBe(1);
    expect(bars.leftBorder, '保留的那条竖线是 Vmark 的左边框').toBe(true);
    expect(bars.leftBorderColor).toBe(bars.accent);
  });
}

test('提示块（深色，> [!WARNING]）：只有一条左侧竖线，颜色取 Vditor 的提示类型色', async ({ page }, testInfo) => {
  await installMockWorkspace(page, { files: { 'callout.md': '> [!WARNING]\n> 小心\n\n> 普通引用\n' } });
  await page.goto('/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'bloom-ink-dark'));
  const callout = page.locator('.vditor-reset blockquote.callout').first();
  await callout.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  const r = await callout.evaluate((el) => {
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, '::before');
    const probe = document.createElement('span');
    probe.style.color = 'var(--callout-color)';
    el.appendChild(probe);
    const calloutColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      beforeBg: before.backgroundColor,
      leftWidth: parseFloat(cs.borderLeftWidth),
      leftColor: cs.borderLeftColor,
      calloutColor,
    };
  });
  const dir = process.env.PW_SCREENSHOT_DIR;
  await page.locator('.vditor-ir').screenshot({
    path: dir ? path.join(dir, 'callout-dark.png') : testInfo.outputPath('callout-dark.png'),
  });
  expect(r.beforeBg, 'Vditor 自带的 ::before 竖线不再显示').toBe('rgba(0, 0, 0, 0)');
  expect(r.leftWidth).toBeGreaterThan(0);
  expect(r.leftColor).toBe(r.calloutColor);
});
