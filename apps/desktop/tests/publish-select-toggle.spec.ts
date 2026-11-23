import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const MD = '# 全选测试\n\n正文。\n';

/** 模拟主进程：登录状态固定；theme 决定浅色 / 深色。 */
async function openPublish(page: Page, auth: Record<string, boolean>, theme = 'apple-light') {
  await page.addInitScript(
    ({ md, authMap, themeId }: { md: string; authMap: Record<string, boolean>; themeId: string }) => {
      const allOut = Object.fromEntries(['weixin', 'zhihu', 'juejin', 'csdn', 'cnblogs', 'baijiahao', 'weibo', 'bilibili', 'xiaohongshu', 'douyin'].map((k) => [k, false]));
      const meta = { id: 'a', title: 'sel', relativePath: 'sel.md', folder: '', wordCount: 4, updatedAt: Date.now(), imageCount: 0, hasFrontmatter: false, excerpt: '' };
      const w = window as unknown as { electronAPI: Record<string, unknown> };
      w.electronAPI = {
        getWorkspacePath: async () => '/tmp/vmark-sel-test',
        getRecentWorkspaces: async () => ['/tmp/vmark-sel-test'],
        listArticles: async () => [meta],
        listFolders: async () => [],
        getImageBedConfig: async () => ({ strategy: 'platform_private' }),
        getStartupConfig: async () => ({ lastArticlePath: 'sel.md', theme: themeId }),
        getPlatformAuthStates: async () => ({ ...allOut, ...authMap }),
        getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
        readArticle: async () => md,
        saveArticle: async () => ({ ok: true }),
        saveStartupConfig: async () => ({ ok: true }),
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: () => () => {},
      };
      localStorage.setItem('vmark.publishDraft.v1:sel.md', JSON.stringify({ selected: [] }));
    },
    { md: MD, authMap: auth, themeId: theme }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // 主题由设置页切换；这里直接设 html[data-theme]，等同用户选了该主题
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
}

const box = (page: Page, id: string) => page.getByTestId(`platform-row-${id}`).getByRole('checkbox');
const SIGNED_IN = ['weixin', 'zhihu', 'xiaohongshu'];
const shot = (name: string) => path.join(process.env.PW_SCREENSHOT_DIR || '/tmp', name);

test.describe('「全选可推送」切换按钮', () => {
  test('第一次点勾选所有已登录平台（不含 GitHub 博客），文案变「取消全选」；再点全部取消；不再全选时文案恢复', async ({ page }) => {
    await openPublish(page, { weixin: true, zhihu: true, xiaohongshu: true, csdn: false });
    await expect(page.getByTestId('platform-row-xiaohongshu').locator('[data-auth="xiaohongshu"]')).toHaveText('已登录');
    const btn = page.getByTestId('select-pushable');
    await expect(btn).toHaveText('全选可推送');

    await btn.click();
    for (const id of SIGNED_IN) await expect(box(page, id)).toHaveAttribute('data-state', 'checked');
    for (const id of ['csdn', 'juejin', 'github_static']) await expect(box(page, id)).toHaveAttribute('data-state', 'unchecked');
    await expect(btn).toHaveText('取消全选');

    await btn.click();
    for (const id of [...SIGNED_IN, 'csdn', 'github_static']) await expect(box(page, id)).toHaveAttribute('data-state', 'unchecked');
    await expect(btn).toHaveText('全选可推送');

    // 全选后手动取消一个 → 不再是全选，文案恢复；再点又全选
    await btn.click();
    await expect(btn).toHaveText('取消全选');
    await box(page, 'zhihu').click();
    await expect(btn).toHaveText('全选可推送');
    await btn.click();
    await expect(box(page, 'zhihu')).toHaveAttribute('data-state', 'checked');
    await expect(btn).toHaveText('取消全选');
  });

  for (const [scheme, theme] of [['light', 'apple-light'], ['dark', 'bloom-ink-dark']] as const) {
    test(`按钮是 ui/ Button（次要样式、带边框、≥36px、正常字号），在平台列表顶部（${scheme}）`, async ({ page }) => {
      await openPublish(page, { weixin: true, zhihu: true, xiaohongshu: true }, theme);
      const btn = page.getByTestId('select-pushable');
      await expect(btn).toBeVisible();
      const s = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          cls: el.className,
          height: el.getBoundingClientRect().height,
          fontSize: parseFloat(cs.fontSize),
          border: parseFloat(cs.borderTopWidth),
          borderStyle: cs.borderTopStyle,
          opacity: parseFloat(cs.opacity),
        };
      });
      expect(s.tag).toBe('BUTTON');
      // ui/button.tsx 的 secondary 变体
      for (const c of ['inline-flex', 'border', 'border-line', 'bg-canvas', 'text-ink']) expect(s.cls.split(/\s+/)).toContain(c);
      expect(s.height).toBeGreaterThanOrEqual(36);
      expect(s.fontSize).toBeGreaterThanOrEqual(13);
      expect(s.border).toBeGreaterThanOrEqual(1);
      expect(s.borderStyle).toBe('solid');
      expect(s.opacity).toBe(1);
      // 在第一行平台之上
      const b = await btn.boundingBox();
      const first = await page.getByTestId('platform-row-weixin').boundingBox();
      expect(b && first && b.y + b.height <= first.y).toBe(true);
      await page.getByRole('dialog').locator('aside').screenshot({ path: shot(`select-toggle-${scheme}.png`) });
      await btn.click();
      await expect(btn).toHaveText('取消全选');
      await page.mouse.move(0, 0);
      await page.getByRole('dialog').locator('aside').screenshot({ path: shot(`select-toggle-${scheme}-selected.png`) });
    });
  }
});
