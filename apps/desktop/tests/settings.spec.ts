import { expect, test, type Page } from '@playwright/test';

async function openEditorForSettings(page: Page) {
  await page.addInitScript(() => {
    let savedImageBed: Record<string, unknown> = { strategy: 'platform_private' };
    (window as unknown as { __testedImageBedConfigs?: unknown[] }).__testedImageBedConfigs = [];

    const articleMeta = {
      id: 'settings-1',
      title: '设置测试文章',
      relativePath: 'settings-demo.md',
      folder: '',
      wordCount: 20,
      updatedAt: Date.now(),
      imageCount: 0,
      hasFrontmatter: false,
      excerpt: '',
    };

    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getWorkspacePath: async () => '/tmp/vmark-settings-test',
      getRecentWorkspaces: async () => ['/tmp/vmark-settings-test'],
      listArticles: async () => [articleMeta],
      listFolders: async () => [],
      getImageBedConfig: async () => savedImageBed,
      saveImageBedConfig: async (cfg: Record<string, unknown>) => {
        savedImageBed = cfg;
        return { ok: true };
      },
      testImageBedUpload: async (cfg: Record<string, unknown>) => {
        (window as unknown as { __testedImageBedConfigs: unknown[] }).__testedImageBedConfigs.push(cfg);
        return {
          ok: true,
          message: `GitHub 图床校验通过 (${String(cfg.repo ?? '')})`,
        };
      },
      getStartupConfig: async () => ({ lastArticlePath: 'settings-demo.md', theme: 'apple-light' }),
      getPlatformAuthStates: async () => ({ weixin: false, github_static: true }),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async () => '# 设置测试\n\n正文内容\n',
      saveArticle: async () => ({ ok: true }),
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: () => () => {},
    };
  });

  await page.goto('http://localhost:4173');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('SettingsView Theme & ImageBed E2E', () => {
  test('切换 Bloom 主题会更新 html[data-theme]，切换图床为 GitHub 并测试连通性会触发 testImageBedUpload', async ({
    page,
  }) => {
    await openEditorForSettings(page);

    // Click settings button in TopBar
    await page.getByTitle('偏好设置 (图床 / 平台 / GitHub)').click();
    await expect(page.getByRole('button', { name: '外观主题' })).toBeVisible();

    // Switch to 外观主题 and test Bloom themes (and verify typora-white is removed)
    await page.getByRole('button', { name: '外观主题' }).click();
    await expect(page.getByRole('button', { name: /Typora White/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Bloom Amber 琥珀暖光', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'bloom-amber');

    await page.getByRole('button', { name: 'Bloom Amber Dark 琥珀暗夜', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'bloom-amber-dark');

    // Switch to 图像与图床 and test PicGo-Core + GitHub ImageBed
    await page.getByRole('button', { name: '图像与图床' }).click();
    await page.getByText('上传至通用云图床（PicGo-Core / 全平台对象存储）').click();

    await page.getByRole('button', { name: 'PicGo-Core', exact: true }).click();
    await page.getByPlaceholder('PicGo-Core 可执行路径（默认 picgo）').fill('/Users/leileigwl/.local/share/pnpm/picgo');
    await page.getByRole('button', { name: '测试图床连通性' }).click();

    await page.getByRole('button', { name: 'GitHub', exact: true }).click();

    await page.getByPlaceholder('GitHub 仓库 (如 user/images)').fill('vmark-org/blog-assets');
    await page.getByPlaceholder('Personal Access Token').fill('ghp_test_token_123456');

    await page.getByRole('button', { name: '测试图床连通性' }).click();
    await expect(page.getByText('GitHub 图床校验通过 (vmark-org/blog-assets)')).toBeVisible();

    const testedConfigs = await page.evaluate(
      () => (window as unknown as { __testedImageBedConfigs: Array<Record<string, unknown>> }).__testedImageBedConfigs
    );
    expect(testedConfigs).toHaveLength(2);
    expect(testedConfigs[0]).toMatchObject({
      strategy: 'custom_oss',
      provider: 'picgo_core',
      picgoPath: '/Users/leileigwl/.local/share/pnpm/picgo',
    });
    expect(testedConfigs[1]).toMatchObject({
      strategy: 'custom_oss',
      provider: 'github',
      repo: 'vmark-org/blog-assets',
      token: 'ghp_test_token_123456',
    });
  });
});
