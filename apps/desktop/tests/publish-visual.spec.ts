import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const MD = ['# 多平台发布：把一篇长文同时推到十一个平台的草稿箱', '', '正文第一段，介绍背景。', '', '![配图](./assets/demo.png)', '', '## 第二节', '', '更多内容。'].join('\n');

async function setup(page: Page, theme: string) {
  await page.addInitScript(
    ({ md, theme: t }: { md: string; theme: string }) => {
      const auth: Record<string, boolean> = { weixin: true, juejin: true, xiaohongshu: true, zhihu: false };
      const meta = { id: 'v', title: 'visual', relativePath: 'visual.md', folder: '', wordCount: 40, updatedAt: Date.now(), imageCount: 1, hasFrontmatter: false, excerpt: '' };
      (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
        getWorkspacePath: async () => '/tmp/vmark-visual',
        getRecentWorkspaces: async () => ['/tmp/vmark-visual'],
        listArticles: async () => [meta],
        listFolders: async () => [],
        getImageBedConfig: async () => ({ strategy: 'platform_private' }),
        getStartupConfig: async () => ({ lastArticlePath: 'visual.md', theme: t }),
        getPlatformAuthStates: async () => ({ ...auth }),
        getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
        readArticle: async () => md,
        saveArticle: async () => ({ ok: true }),
        saveStartupConfig: async () => ({ ok: true }),
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: () => () => {},
      };
      localStorage.setItem('vmark.publishDraft.v1:visual.md', JSON.stringify({ selected: ['weixin', 'zhihu', 'juejin', 'xiaohongshu'] }));
    },
    { md: MD, theme }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** 弹窗里任何按钮、行、输入都不应被横向裁切或溢出。 */
async function expectNoOverflow(page: Page) {
  const offenders = await page.getByRole('dialog').evaluate((root) => {
    const bad: string[] = [];
    const els = root.querySelectorAll<HTMLElement>('button, li, input, textarea, aside, main, [data-testid]');
    els.forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') bad.push(`${el.tagName}.${el.dataset.testid ?? ''}:${el.textContent?.slice(0, 20)}`);
    });
    const r = root.getBoundingClientRect();
    if (r.right > window.innerWidth || r.bottom > window.innerHeight) bad.push('dialog-outside-viewport');
    return bad;
  });
  expect(offenders).toEqual([]);
}

async function expectTargets(page: Page) {
  const small = await page.getByRole('dialog').evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('[data-testid^="platform-row-"], [data-testid^="attention-"] > button, [data-testid="publish-start"]')]
      .filter((el) => el.getBoundingClientRect().height < 36)
      .map((el) => el.dataset.testid ?? el.textContent)
  );
  expect(small).toEqual([]);
}

for (const [mode, theme] of [
  ['light', 'apple-light'],
  ['dark', 'bloom-ink-dark'],
] as const) {
  test(`发布弹窗截图（${mode}）：无溢出，点击区域 ≥ 36px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await setup(page, theme);
    await page.locator('#pub-digest').fill('一'.repeat(38));
    await page.getByTestId('attention-juejin').getByRole('button', { expanded: false }).click();
    await expectNoOverflow(page);
    await expectTargets(page);
    const dir = process.env.PW_SCREENSHOT_DIR;
    await page.screenshot({ path: dir ? path.join(dir, `simplify-dialog-${mode}.png`) : testInfo.outputPath(`simplify-dialog-${mode}.png`) });
    await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
    await page.getByRole('dialog').locator('main').evaluate((m) => (m.scrollTop = m.scrollHeight));
    await expectNoOverflow(page);
    await expect(page.getByTitle('卡片 1')).toBeVisible();
    await page.waitForTimeout(1500); // 卡片缩略图在 iframe 里异步渲染，仅为截图等待
    await page.screenshot({ path: dir ? path.join(dir, `simplify-dialog-cards-${mode}.png`) : testInfo.outputPath(`simplify-dialog-cards-${mode}.png`) });
  });
}

for (const [mode, theme] of [
  ['light', 'apple-light'],
  ['dark', 'bloom-ink-dark'],
] as const) {
  test(`掘金缺分类（${mode}）：点开是一行分类选项，选中后就绪`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await setup(page, theme);
    const dir = process.env.PW_SCREENSHOT_DIR;
    const shot = (name: string) => page.screenshot({ path: dir ? path.join(dir, `${name}-${mode}.png`) : testInfo.outputPath(`${name}-${mode}.png`) });
    await page.locator('#pub-title').fill('掘金分类测试');
    await page.locator('#pub-digest').fill('这是一段专门为掘金准备的摘要，长度需要落在五十到一百字之间，所以这里多写几句，说明这篇文章讲的是多平台发布流程的设计与实现。');
    await page.locator('#pub-tags').fill('前端');
    await page.locator('#pub-tags').press('Enter');
    const row = page.getByTestId('attention-juejin');
    await expect(row).toContainText('掘金：缺分类');
    await row.getByRole('button', { expanded: false }).click();
    const group = row.getByRole('radiogroup', { name: '掘金分类' });
    await expect(group.getByRole('radio')).toHaveCount(8);
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
    await expectNoOverflow(page);
    await shot('juejin-category-missing');
    await group.getByRole('radio', { name: '人工智能' }).click();
    await expect(group.getByRole('radio', { name: '人工智能' })).toHaveAttribute('aria-checked', 'true');
    await expect(row).toContainText('已就绪');
    await expectNoOverflow(page);
    await shot('juejin-category-picked');
  });
}
