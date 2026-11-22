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

test.describe('All 13 Platforms Auth, Preview & Batch Dispatch E2E', () => {
  test('校验全部 13 个平台授权状态、多平台排版预览与一键批量分发结果链接', async ({ page }, testInfo) => {
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
    await expect(page.getByText('Linux.do (Discourse)')).toHaveCount(0);
    await expect(page.getByText('X (Twitter)')).toHaveCount(0);
    await snap('all-platforms-accounts.png');
    await page.getByRole('button', { name: '编辑' }).click();

    // 2. PublishModal -> verify 5 platform previews (WeChat, Zhihu, Baijiahao, Xiaohongshu 3:4, Douyin 3:4)
    await page.getByRole('button', { name: '分发' }).click();
    await expect(page.getByTestId('weixin-preview')).toContainText('ℹ️ 提示');
    await expect(page.getByTestId('weixin-preview').locator('img[src="vcat-asset://local/assets/arch.png"]')).toBeVisible();
    await page.getByRole('button', { name: '知乎专栏' }).click();
    await expect(page.getByTestId('zhihu-preview')).toContainText('ℹ️ 提示');
    await page.getByRole('button', { name: '百家号' }).click();
    await expect(page.getByTestId('baijiahao-preview')).toContainText('全平台分发测试');
    await page.getByRole('button', { name: '小红书 3:4 卡片' }).click();
    await expect(page.getByTestId('xiaohongshu-preview')).toContainText('全平台分发测试');
    await page.getByRole('button', { name: '抖音 3:4 图文' }).click();
    await expect(page.getByTestId('douyin-preview')).toContainText('全平台分发测试');
    await snap('all-platforms-preview.png');

    // 3. Multi-platform dispatch -> check all 13 checkboxes & execute batch publish
    await page.getByRole('button', { name: '多平台分发 / Git' }).click();
    const checkboxes = page.locator('div.divide-y input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBe(ALL_PLATFORMS.length);
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      if (!(await cb.isChecked())) {
        await cb.check();
      }
    }

    await page.getByRole('button', { name: `一键分发至所选平台 (${ALL_PLATFORMS.length})` }).click();
    await expect(page.getByRole('link', { name: '打开草稿 / 查看链接' })).toHaveCount(ALL_PLATFORMS.length);
    await snap('all-platforms-dispatch.png');
  });
});
