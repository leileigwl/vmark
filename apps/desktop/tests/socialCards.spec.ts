import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const SHORT_MD = ['# 卡片缩略图', '', '第一段正文，用来生成小红书 3:4 卡片。', '', '## 小节', '', '- 要点一', '- 要点二'].join('\n');

const LONG_MD = [
  '# 超长文章',
  '',
  ...Array.from({ length: 60 }, (_, i) => `## 第 ${i + 1} 节\n\n${'这一节用很多句子来填满卡片，确保排版器会生成足够多的页面。'.repeat(6)}\n`),
].join('\n');

/** 只为卡片相关用例提供最小的 electronAPI 桩：一篇文章、小红书已登录。 */
async function openWithMarkdown(page: Page, md: string, theme = 'apple-light') {
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
  // 与设置页切换主题相同：主题只靠 <html data-theme> 生效
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByTestId('platform-row-xiaohongshu').getByRole('checkbox').click();
  // 卡片缩略图在「小红书 · 抖音」专属分区里，展开后出现
  await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
}

/** 截图只在设置了 PW_SCREENSHOT_DIR 时写入，且失败不影响用例结果。 */
async function snap(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.PW_SCREENSHOT_DIR;
  const at = (file: string) => (dir ? path.join(dir, file) : testInfo.outputPath(file));
  const strip = page.getByRole('radiogroup', { name: '卡片模板' }).locator('..');
  await strip.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.getByRole('dialog').screenshot({ path: at(`${name}-dialog.png`) }).catch(() => undefined);
  await strip.screenshot({ path: at(`${name}.png`) }).catch(() => undefined);
}

test.use({ deviceScaleFactor: 2 });

test.describe('小红书卡片缩略图', () => {
  test('缩略图按 1242×1656 输出尺寸缩放，卡片不被裁切', async ({ page }, testInfo) => {
    await openWithMarkdown(page, SHORT_MD);
    const thumb = page.locator('iframe[title="卡片 1"]');
    await expect(thumb).toBeVisible();
    await snap(page, testInfo, 'card-strip-thumbnails');
    const frame = await (await thumb.elementHandle())!.contentFrame();
    const size = await frame!.evaluate(() => ({
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      docW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
    }));
    // 卡片本身是 1242×1656，缩略图视口必须正好容纳它，否则右侧和底部会被裁掉
    expect(size).toEqual({ viewW: 1242, viewH: 1656, docW: 1242, docH: 1656 });
    const box = await thumb.locator('..').boundingBox();
    expect(Math.round(box!.width)).toBe(132);
    expect(Math.round(box!.height)).toBe(Math.round((132 * 1656) / 1242));
  });
});

test.describe('超出平台卡片上限', () => {
  for (const theme of ['apple-light', 'bloom-ink-dark']) {
  test(`超过 18 张时明确提示有几张不会发布，而不是悄悄丢掉（${theme}）`, async ({ page }, testInfo) => {
    await openWithMarkdown(page, LONG_MD, theme);
    await expect(page.locator('iframe[title="卡片 1"]')).toBeVisible();
    await snap(page, testInfo, `card-overflow-notice-${theme}`);
    const count = page.getByText(/共 \d+ 张 3:4 卡片/);
    await expect(count).toBeVisible();
    const total = Number((await count.textContent())!.match(/共 (\d+) 张/)![1]);
    expect(total).toBeGreaterThan(18);
    const notice = page.getByRole('status').filter({ hasText: '不会发布' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(`只发布前 18 张`);
    await expect(notice).toContainText(`后 ${total - 18} 张（第 19–${total} 张）不会发布`);
  });
  }

  test('未超过上限时不显示提示', async ({ page }) => {
    await openWithMarkdown(page, SHORT_MD);
    await expect(page.getByText(/共 \d+ 张 3:4 卡片，平台上限 18 张/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '不会发布' })).toHaveCount(0);
  });
});

const MATH_MD = ['# 公式卡片', '', '质能方程 $E=mc^2$ 很有名。', '', '$$', '\\int_0^1 x^2\\,dx = \\frac{1}{3}', '$$', '', '$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$'].join('\n');

test.describe('公式卡片', () => {
  test('缩略图里的公式用 KaTeX 排版，字体已加载', async ({ page }, testInfo) => {
    await openWithMarkdown(page, MATH_MD);
    const thumb = page.locator('iframe[title="卡片 2"]');
    await expect(thumb).toBeVisible();
    await snap(page, testInfo, 'card-katex');
    const frame = (await (await thumb.elementHandle())!.contentFrame())!;
    await expect.poll(() => frame.evaluate(() => document.querySelectorAll('.katex').length)).toBe(3);
    expect(await frame.evaluate(() => document.querySelectorAll('.katex-display .mfrac').length)).toBe(2);
    expect(await frame.evaluate(() => document.body.textContent?.includes('(1)/(3)'))).toBe(false);
    // KaTeX 字体真正加载成功（iframe 若是不透明源，字体会被跨源拦截而退回系统字体）
    const katexFontLoaded = () =>
      frame.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'KaTeX_Main' && f.status === 'loaded');
      });
    await expect.poll(katexFontLoaded).toBe(true);
  });
});

test.describe('卡片模板', () => {
  for (const [name, id] of [['方格手账', 'grid-notebook'], ['便利贴', 'sticky-note']]) {
    test(`可切换到「${name}」模板，缩略图按该模板渲染`, async ({ page }, testInfo) => {
      await openWithMarkdown(page, SHORT_MD);
      const chip = page.getByRole('radiogroup', { name: '卡片模板' }).getByRole('radio', { name });
      await chip.click();
      await expect(chip).toHaveAttribute('aria-checked', 'true');
      // 切模板会重写 iframe 内容：用 frameLocator 每次重新取 body 并自动等待，不在半加载的文档上 evaluate（body 可能还是 null）。
      await expect(page.frameLocator('iframe[title="卡片 2"]').locator('body')).toHaveAttribute('data-template', id);
      await snap(page, testInfo, `card-template-${id}`);
    });
  }
});
