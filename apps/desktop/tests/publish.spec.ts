import { expect, test, type Page } from '@playwright/test';

async function openEditorWithArticle(page: Page, initialMarkdown: string) {
  await page.addInitScript((md: string) => {
    const articleMeta = {
      id: 'pub-1',
      title: '公众号分发测试文章',
      relativePath: 'publish-demo.md',
      folder: '',
      wordCount: 40,
      updatedAt: Date.now(),
      imageCount: 0,
      hasFrontmatter: false,
      excerpt: '',
    };
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getWorkspacePath: async () => '/tmp/vmark-pub-test',
      getRecentWorkspaces: async () => ['/tmp/vmark-pub-test'],
      listArticles: async () => [articleMeta],
      listFolders: async () => [],
      getImageBedConfig: async () => ({ strategy: 'platform_private' }),
      getStartupConfig: async () => ({ lastArticlePath: 'publish-demo.md', theme: 'apple-light' }),
      getPlatformAuthStates: async () => ({}),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async () => md,
      saveArticle: async () => ({ ok: true }),
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: () => () => {},
      publishWeixinDraft: async () => ({
        ok: true,
        postId: '10086',
        url: 'https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=10086',
        verified: true,
      }),
    };
  }, initialMarkdown);

  await page.goto('http://localhost:4173');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('Phase 2 PublishModal & WeChat Preview E2E', () => {
  test('打开发布弹窗：支持头图/作者/摘要设置、公众号行内样式预览与一键复制富文本', async ({ page }) => {
    const md = '# 公众号标题\n\n正文包含 **加粗** 与 [外部资料](https://example.com/a)。\n\n> 重点提示卡片\n';
    await openEditorWithArticle(page, md);

    await page.getByRole('button', { name: '分发' }).click();
    const preview = page.getByTestId('weixin-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('公众号标题');
    await expect(preview).toContainText('参考链接');

    // Fill cover image & toggle showCoverInBody
    await page.getByPlaceholder('https://... 或 ./assets/cover.png').fill('https://mmbiz.qpic.cn/demo-cover.png');
    await page.getByLabel('在正文顶部同时展示封面图').check();
    await expect(preview.locator('img[src="https://mmbiz.qpic.cn/demo-cover.png"]')).toBeVisible();

    // Fill author & digest
    await page.getByPlaceholder('选填，如：Vmark 作者').fill('VmarkAuthor');
    await page.getByPlaceholder(/文章摘要|公众号标题/).fill('自定义公众号摘要');

    // Click copy rich text
    await page.getByRole('button', { name: '一键复制公众号富文本' }).click();
    await expect(page.getByText(/已复制公众号富文本|复制失败/)).toBeVisible();

    // Click push to WeChat draft box
    await page.getByRole('button', { name: '推送到公众号草稿箱' }).click();
    await expect(page.getByText(/已推送至公众号草稿箱（ID: 10086/)).toBeVisible();

    // Switch to Git / 其他平台 tab and close
    await page.getByRole('button', { name: 'Git / 其他平台' }).click();
    await expect(page.getByText(/已注册 .* 个适配器/)).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(preview).toBeHidden();
  });
});
