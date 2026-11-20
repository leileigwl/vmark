import { expect, test, type Page } from '@playwright/test';

async function openEditorForSettings(page: Page) {
  await page.addInitScript(() => {
    let savedImageBed: Record<string, unknown> = { strategy: 'platform_private', defaultImageScale: 50 };
    (window as unknown as { __savedImageBedConfigs?: unknown[] }).__savedImageBedConfigs = [];

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
        (window as unknown as { __savedImageBedConfigs: unknown[] }).__savedImageBedConfigs.push(cfg);
        return { ok: true };
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

  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('SettingsView Theme & Image Settings E2E', () => {
  test('切换 Bloom 主题会更新 html[data-theme]，图像与图床默认直传官方图床且隐藏通用云图床表单', async ({
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

    // Switch to 图像与图床: verify official platform image upload is visible & cloud OSS form is hidden
    await page.getByRole('button', { name: '图像与图床' }).click();
    await expect(page.getByText('分发时直传目标平台官方图床（默认推荐）')).toBeVisible();
    await expect(page.getByText('上传至通用云图床（PicGo-Core / 全平台对象存储）')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'PicGo-Core', exact: true })).toHaveCount(0);

    // Switch default image display scale and verify html[data-img-scale] + persisted config
    await page.getByRole('button', { name: '75%', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-img-scale', '75');
    await page.getByRole('button', { name: '100%（原宽）', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-img-scale', '100');

    const savedConfigs = await page.evaluate(
      () => (window as unknown as { __savedImageBedConfigs: Array<Record<string, unknown>> }).__savedImageBedConfigs
    );
    expect(savedConfigs).toHaveLength(2);
    expect(savedConfigs[0]).toMatchObject({ strategy: 'platform_private', defaultImageScale: 75 });
    expect(savedConfigs[1]).toMatchObject({ strategy: 'platform_private', defaultImageScale: 100 });
  });
});
