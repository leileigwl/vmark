import { expect, test, type Page } from '@playwright/test';

const MD = '# 登录状态测试\n\n正文。\n\n![图](./assets/demo.png)\n';

/** 模拟主进程：getPlatformAuthStates 由测试放行（manual 模式），逐平台事件用 __push 推送。 */
async function openEditor(page: Page, auth: Record<string, boolean>, manual = false) {
  await page.addInitScript(
    ({ md, authMap, manual: m }: { md: string; authMap: Record<string, boolean>; manual: boolean }) => {
      const meta = { id: 'a', title: 'auth', relativePath: 'auth.md', folder: '', wordCount: 10, updatedAt: Date.now(), imageCount: 1, hasFrontmatter: false, excerpt: '' };
      const w = window as unknown as Record<string, unknown> & { electronAPI: Record<string, unknown> };
      const listeners: Array<(s: Record<string, boolean>) => void> = [];
      const pending: Array<() => void> = [];
      w.__invokes = 0;
      w.__auth = authMap;
      w.__push = (s: Record<string, boolean>) => listeners.forEach((l) => l(s));
      w.__finish = () => pending.splice(0).forEach((f) => f());
      w.electronAPI = {
        getWorkspacePath: async () => '/tmp/vmark-auth-test',
        getRecentWorkspaces: async () => ['/tmp/vmark-auth-test'],
        listArticles: async () => [meta],
        listFolders: async () => [],
        getImageBedConfig: async () => ({ strategy: 'platform_private' }),
        getStartupConfig: async () => ({ lastArticlePath: 'auth.md', theme: 'apple-light' }),
        getPlatformAuthStates: () => {
          w.__invokes = (w.__invokes as number) + 1;
          if (!m || (w.__invokes as number) === 1) return Promise.resolve({ ...authMap });
          return new Promise((resolve) => pending.push(() => resolve({ ...authMap })));
        },
        getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
        readArticle: async () => md,
        saveArticle: async () => ({ ok: true }),
        saveStartupConfig: async () => ({ ok: true }),
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: (cb: (s: Record<string, boolean>) => void) => {
          listeners.push(cb);
          return () => {};
        },
      };
      localStorage.setItem('vmark.publishDraft.v1:auth.md', JSON.stringify({ selected: ['weixin'] }));
    },
    { md: MD, authMap: auth, manual }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

async function openPublish(page: Page) {
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

const authCell = (page: Page, id: string) => page.getByTestId(`platform-row-${id}`).locator(`[data-auth="${id}"]`);
const invokes = (page: Page) => page.evaluate(() => (window as unknown as { __invokes: number }).__invokes);

test.describe('发布窗口：登录状态与内容校验分开显示', () => {
  test('没勾选的平台也显示登录状态；「内容就绪 / 差 N 项」只在勾选的平台下出现', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true, csdn: false, weibo: true });
    await openPublish(page);
    await expect(authCell(page, 'zhihu')).toHaveText('已登录');
    await expect(authCell(page, 'weibo')).toHaveText('已登录');
    await expect(authCell(page, 'csdn')).toContainText('未登录');
    await expect(authCell(page, 'github_static')).toHaveText('无需登录');
    await expect(page.getByTestId('platform-row-weixin')).toContainText('差 2 项');
    await expect(page.getByTestId('platform-row-zhihu')).not.toContainText(/就绪|差 \d+ 项/);
    await expect(page.getByTestId('auth-summary')).toHaveText('已登录 3 / 10');
  });

  test('打开弹窗自动检测一次；刷新时每行显示检测中，某个平台结果一到立即更新，不等其他平台', async ({ page }) => {
    await openEditor(page, { weixin: true, weibo: false, zhihu: false }, true);
    const before = await invokes(page);
    await openPublish(page);
    await expect.poll(() => invokes(page)).toBeGreaterThan(before);
    // 打开时那一轮也走 manual，放行它
    await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());
    await expect(authCell(page, 'weibo')).toContainText('未登录');

    await page.evaluate(() => Object.assign((window as unknown as { __auth: Record<string, boolean> }).__auth, { weibo: true, zhihu: true }));
    await page.getByRole('button', { name: '刷新登录状态' }).click();
    await expect(authCell(page, 'weibo')).toHaveText('检测中');
    await expect(authCell(page, 'zhihu')).toHaveText('检测中');
    // 主进程逐平台推送：微博先回来
    await page.evaluate(() => (window as unknown as { __push: (s: Record<string, boolean>) => void }).__push({ weibo: true }));
    await expect(authCell(page, 'weibo')).toHaveText('已登录');
    await expect(authCell(page, 'zhihu')).toHaveText('检测中');
    await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());
    await expect(authCell(page, 'zhihu')).toHaveText('已登录');
    await expect(page.getByTestId('auth-summary')).toHaveText('已登录 3 / 10');
  });

  test('「全选可推送」：一键勾选所有已登录的平台，未登录的不勾', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true, xiaohongshu: true, csdn: false });
    await openPublish(page);
    await expect(authCell(page, 'xiaohongshu')).toHaveText('已登录');
    await page.getByTestId('select-pushable').click();
    for (const id of ['weixin', 'zhihu', 'xiaohongshu'])
      await expect(page.getByTestId(`platform-row-${id}`).getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    for (const id of ['csdn', 'juejin', 'github_static'])
      await expect(page.getByTestId(`platform-row-${id}`).getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked');
  });
});
