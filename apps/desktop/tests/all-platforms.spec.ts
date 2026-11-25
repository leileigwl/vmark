import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ALL_PLATFORMS = [
  'github_static',
  'weixin',
  'cnblogs',
  'juejin',
  'csdn',
  'zhihu',
  'baijiahao',
  'weibo',
  'bilibili',
  'douyin',
  'xiaohongshu',
] as const;

async function setupAllPlatformsPage(page: Page) {
  await page.addInitScript((platforms: readonly string[]) => {
    const authMap = Object.fromEntries(platforms.map((id) => [id, true]));
    const articleMeta = {
      id: 'all-1',
      title: '全平台一键分发实测文章',
      relativePath: 'all-platforms-demo.md',
      folder: '',
      wordCount: 120,
      updatedAt: Date.now(),
      imageCount: 1,
      hasFrontmatter: false,
      excerpt: '全平台分发验证',
    };
    const md = [
      '# 全平台分发测试',
      '',
      '![本地配图](./assets/arch.png)',
      '',
      '> [!NOTE]',
      '> 这是多平台 Callout 与排版一致性测试。',
    ].join('\n');

    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getWorkspacePath: async () => '/tmp/vmark-all-platforms',
      getRecentWorkspaces: async () => ['/tmp/vmark-all-platforms'],
      listArticles: async () => [articleMeta],
      listFolders: async () => [],
      getImageBedConfig: async () => ({ strategy: 'platform_private', provider: 'smms' }),
      getStartupConfig: async () => ({ lastArticlePath: 'all-platforms-demo.md', theme: 'apple-light' }),
      getPlatformAuthStates: async () => ({ ...authMap }),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async () => md,
      saveArticle: async () => ({ ok: true }),
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: () => () => {},
      onPlatformAuthUpdated: () => () => {},
      logoutPlatform: async (pid: string) => {
        authMap[pid] = false;
        return true;
      },
      openPlatformLogin: async (pid: string) => {
        authMap[pid] = true;
        return true;
      },
      publishMultiPlatform: async (payload: { targets: Array<{ platformId: string; mode: string }> }) => ({
        results: payload.targets.map((t) => ({
          platformId: t.platformId,
          ok: true,
          mode: t.mode,
          postId: `draft-${t.platformId}`,
          url: `https://example.com/${t.platformId}/draft`,
          verified: true,
          uploadedImagesCount: 1,
          message: `已推送至 ${t.platformId} 草稿箱`,
        })),
      }),
    };
  }, ALL_PLATFORMS);

  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('全平台：登录状态一致、逐平台适配与批量推送', () => {
  test('设置页与发布窗口状态一致；补齐各平台要求后一次推送全部平台', async ({ page }, testInfo) => {
    await setupAllPlatformsPage(page);
    const screenshotDir = process.env.PW_SCREENSHOT_DIR;
    const snap = async (name: string) => {
      const targetPath = screenshotDir ? path.join(screenshotDir, name) : testInfo.outputPath(name);
      await page.screenshot({ path: targetPath, fullPage: true });
    };

    // 1. 设置 → 平台账号：除 GitHub 博客外全部显示已登录，且不再展示内部路径
    await page.getByTitle('偏好设置').click();
    await page.getByRole('button', { name: '平台账号' }).click();
    const accounts = page.getByTestId('accounts-list');
    await expect(accounts.locator('[data-auth-status="signedIn"]')).toHaveCount(ALL_PLATFORMS.length - 1);
    await expect(page.getByText('references/')).toHaveCount(0);
    await snap('all-platforms-accounts.png');

    // 2. 打开发布窗口，勾选全部平台
    await page.getByRole('button', { name: '编辑' }).click();
    await page.getByRole('button', { name: '发布', exact: true }).click();
    for (const id of ALL_PLATFORMS) {
      const box = page.getByTestId(`platform-row-${id}`).getByRole('checkbox');
      if ((await box.getAttribute('data-state')) !== 'checked') await box.click();
      await expect(box).toHaveAttribute('data-state', 'checked');
    }
    await expect(page.getByTestId('publish-start')).not.toHaveText(`推送到 ${ALL_PLATFORMS.length} 个草稿箱`);

    // 3. 共用信息补齐标签与合规摘要（掘金 50–100 字）；“需要单独处理”只剩百家号标题、微博摘要、掘金分类；公众号、小红书/抖音在各自分区
    await page.locator('#pub-tags').fill('前端');
    await page.locator('#pub-tags').press('Enter');
    await page.locator('#pub-digest').fill('这是一篇用于验证多平台发布流程的测试文章，覆盖标题、摘要、标签和封面比例的适配，确保每个平台都能顺利进入草稿箱。');
    await expect(page.getByTestId('attention-list').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('section-weixin')).toContainText('使用正文首图');
    await expect(page.getByTestId('attention-juejin')).toContainText('掘金：缺分类');
    await expect(page.getByTestId('attention-baijiahao')).toContainText('百家号：标题差 1 字');
    await expect(page.getByTestId('attention-weibo')).toContainText('微博：摘要超 12 字');
    await expect(page.getByTestId('section-social')).toContainText('小红书 · 抖音');
    await expect(page.getByTestId('section-social')).toContainText('张卡片');
    await page.getByTestId('attention-baijiahao').getByRole('button', { expanded: false }).click();
    await page.locator('#t-baijiahao').fill('全平台分发测试短标题');
    await page.getByTestId('attention-weibo').getByRole('button', { expanded: false }).click();
    await page.locator('#d-weibo').fill('多平台发布流程测试');
    await page.getByTestId('attention-juejin').getByRole('button', { expanded: false }).click();
    await page.getByTestId('attention-juejin').getByRole('radio', { name: '前端' }).click();
    for (const id of ALL_PLATFORMS) {
      await expect(page.getByTestId(`platform-row-${id}`)).toContainText('就绪');
    }
    await expect(page.getByTestId('publish-start')).toHaveText(`推送到 ${ALL_PLATFORMS.length} 个草稿箱`);
    await snap('all-platforms-ready.png');

    // 4. 推送：每个平台单独一次请求，全部成功
    const start = page.getByTestId('publish-start');
    await expect(start).toBeEnabled();
    await start.click();
    const results = page.getByTestId('publish-results');
    await expect(results.locator('[data-state="ok"]')).toHaveCount(ALL_PLATFORMS.length, { timeout: 10_000 });
    await expect(page.getByText(`已推送到 ${ALL_PLATFORMS.length} 个平台`)).toBeVisible();
    await expect(page.getByRole('button', { name: '去草稿箱' })).toHaveCount(ALL_PLATFORMS.length - 1);
    await expect(page.getByRole('button', { name: '查看' })).toHaveCount(1);
    await snap('all-platforms-dispatch.png');
  });
});
