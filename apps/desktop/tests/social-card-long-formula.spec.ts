import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Frame, type Page, type TestInfo } from '@playwright/test';
import { PLATFORM_COVER_SPECS } from '@vcat/core';
import katex from 'katex';
import { createKatexCardMath, rebaseKatexFonts } from '@vcat/core';
import { renderCardDeck, type CardPageDriver } from '../src/main/socialCardDeck.ts';

/**
 * 一行放不下、但能在 + 处换行的求和（40 项）；一行放不下也不能换行的宽矩阵（30 列）；一个普通公式。
 * 期望：求和换成多行、矩阵缩小，两者都完整落在卡片内；普通公式不缩放、仍是一行。
 */
const LONG_TEX = Array.from({ length: 40 }, (_, i) => `x_{${i + 1}}^{2}`).join(' + ') + ' = S';
const WIDE_TEX = `\\begin{pmatrix} ${Array.from({ length: 30 }, (_, i) => `a_{${i + 1}}`).join(' & ')} \\end{pmatrix}`;
const SHORT_TEX = '\\int_0^1 x^2\\,dx = \\frac{1}{3}';
const MD = ['# 长公式', '', '求和很长：', '', '$$', LONG_TEX, '$$', '', '矩阵很宽：', '', `$$${WIDE_TEX}$$`, '', '普通公式：', '', `$$${SHORT_TEX}$$`, '', '公式之后的正文还在。'].join('\n');

/** 与 main/socialCardMath.ts 相同的出图 KaTeX：样式内联，字体指向 katex/dist/fonts（file://）。 */
async function cardMath() {
  const cssPath = require.resolve('katex/dist/katex.min.css');
  const css = await fs.readFile(cssPath, 'utf8');
  return createKatexCardMath(katex, rebaseKatexFonts(css, `file://${path.join(path.dirname(cssPath), 'fonts')}`));
}

/** 在卡片页面里量每个行间公式：公式内容（.katex-html 里实际排出的字形范围）是否完整落在卡片内容区（.box）里，以及缩放比例。 */
async function measureFormulas(target: Page | Frame) {
  return target.evaluate(async () => {
    await document.fonts.ready;
    const box = document.querySelector('.box')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.b-math')).map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('.katex-html')!);
      const html = range.getBoundingClientRect();
      const display = el.querySelector('.katex-display') as HTMLElement;
      // 行数：按从上到下排好的各段（.base），某段的顶在前一行底部之下就算新的一行
      const rects = Array.from(el.querySelectorAll('.katex-html > .base')).map((b) => b.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      let lines = 0;
      let lineBottom = -Infinity;
      for (const r of rects) {
        if (r.top >= lineBottom - 1) lines++;
        lineBottom = r.top >= lineBottom - 1 ? r.bottom : Math.max(lineBottom, r.bottom);
      }
      return {
        left: html.left - box.left,
        right: box.right - html.right,
        lines,
        letters: el.querySelectorAll('.mord.mathnormal').length,
        zoom: Number(display.style.zoom || '1'),
      };
    });
  });
}

function expectFitted(formulas: Awaited<ReturnType<typeof measureFormulas>>) {
  expect(formulas).toHaveLength(3);
  formulas.forEach((f, i) => {
    expect(f.left, `第 ${i + 1} 个公式左边超出卡片 ${-f.left}px`).toBeGreaterThanOrEqual(-0.5);
    expect(f.right, `第 ${i + 1} 个公式右边超出卡片 ${-f.right}px`).toBeGreaterThanOrEqual(-0.5);
  });
  const [sum, matrix, normal] = formulas;
  // 求和：在 + 处换行，不缩小，40 个 x 加上 S 一个不少
  expect(sum.lines).toBeGreaterThan(1);
  expect(sum.zoom).toBe(1);
  expect(sum.letters).toBe(41);
  // 矩阵：不能换行，缩小到放得下
  expect(matrix.zoom).toBeLessThan(1);
  // 普通公式：不缩放，一行
  expect(normal.zoom).toBe(1);
  expect(normal.lines).toBe(1);
}

test.describe('卡片里的长公式', () => {
  test('出图：长公式换行、宽矩阵缩小，都在卡片宽度内，普通公式大小不变', async ({ page }, testInfo) => {
    const spec = PLATFORM_COVER_SPECS['3:4'];
    await page.setViewportSize({ width: spec.width, height: spec.height });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-long-formula-'));
    const file = path.join(dir, 'card.html');
    let last: Awaited<ReturnType<typeof measureFormulas>> = [];
    const driver: CardPageDriver = {
      // file:// 页面（与 Electron 出图相同），KaTeX 字体才能从 file:// 加载
      load: async (html) => {
        await fs.writeFile(file, html);
        await page.goto(`file://${file}`);
      },
      evaluate: (script) => page.evaluate(script),
      capture: async () => {
        if ((await page.locator('.b-math').count()) === 3) last = await measureFormulas(page);
        return page.screenshot();
      },
    };
    const { images } = await renderCardDeck(driver, { markdown: MD, themeId: 'ios-memo', maxCards: 18 }, await cardMath());
    const shotDir = process.env.PW_SCREENSHOT_DIR;
    const at = (name: string) => (shotDir ? path.join(shotDir, name) : testInfo.outputPath(name));
    await Promise.all(images.map((png, i) => fs.writeFile(at(`long-formula-card-${i + 1}.png`), png).catch(() => undefined)));
    await fs.rm(dir, { recursive: true, force: true });
    expectFitted(last);
  });

  for (const theme of ['apple-light', 'bloom-ink-dark']) {
    test(`缩略图：长公式换行、宽矩阵缩小，不超出卡片（${theme}）`, async ({ page }, testInfo) => {
      await openWithMarkdown(page, MD, theme);
      const thumb = page.locator('iframe[title="卡片 2"]');
      await expect(thumb).toBeVisible();
      const frame = (await (await thumb.elementHandle())!.contentFrame())!;
      await expect.poll(() => frame.evaluate(() => document.querySelectorAll('.katex-display').length)).toBe(3);
      await frame.evaluate(() => document.fonts.ready.then(() => undefined));
      await snap(page, testInfo, `long-formula-thumb-${theme}`);
      // 字体加载完才能量准宽度，缩放在那之后发生，所以轮询
      await expect.poll(async () => Math.min(...(await measureFormulas(frame)).map((f) => f.right)), { message: '长公式右边超出卡片' }).toBeGreaterThanOrEqual(-0.5);
      expectFitted(await measureFormulas(frame));
    });
  }
});

/** 只为卡片用例提供最小的 electronAPI 桩：一篇文章、小红书已登录（与 socialCards.spec.ts 相同）。 */
async function openWithMarkdown(page: Page, md: string, theme: string) {
  await page.addInitScript(({ source, theme }: { source: string; theme: string }) => {
    const meta = { id: 'c-1', title: 'cards', relativePath: 'cards.md', folder: '', wordCount: 10, updatedAt: Date.now(), imageCount: 0, hasFrontmatter: false, excerpt: '' };
    const noop = () => () => {};
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getWorkspacePath: async () => '/tmp/vmark-cards-test',
      getRecentWorkspaces: async () => ['/tmp/vmark-cards-test'],
      listArticles: async () => [meta],
      listFolders: async () => [],
      getImageBedConfig: async () => ({ strategy: 'platform_private' }),
      getStartupConfig: async () => ({ lastArticlePath: 'cards.md', theme }),
      getPlatformAuthStates: async () => ({ xiaohongshu: true }),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async () => source,
      saveArticle: async () => ({ ok: true }),
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: noop,
      onPlatformAuthUpdated: noop,
    };
  }, { source: md, theme });
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByTestId('platform-row-xiaohongshu').getByRole('checkbox').click();
  await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
}

/** 截图只在设置了 PW_SCREENSHOT_DIR 时写入，失败不影响用例结果。 */
async function snap(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.PW_SCREENSHOT_DIR;
  const at = (file: string) => (dir ? path.join(dir, file) : testInfo.outputPath(file));
  const strip = page.getByRole('radiogroup', { name: '卡片模板' }).locator('..');
  await strip.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.getByRole('dialog').screenshot({ path: at(`${name}-dialog.png`) }).catch(() => undefined);
  await strip.screenshot({ path: at(`${name}.png`) }).catch(() => undefined);
}
