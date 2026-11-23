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
  await page.getByTestId('platform-row-xiaohongshu').click();
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
