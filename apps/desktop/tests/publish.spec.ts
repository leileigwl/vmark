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
      getPlatformAuthStates: async () => ({ weixin: true, github_static: true, cnblogs: false }),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async () => md,
      saveArticle: async () => ({ ok: true }),
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: () => () => {},
      onPlatformAuthUpdated: () => () => {},
      openPlatformLogin: async (platformId: string, url: string) => {
        const w = window as unknown as { __openedBrowserCalls?: Array<{ platformId: string; url: string }> };
        w.__openedBrowserCalls = [...(w.__openedBrowserCalls ?? []), { platformId, url }];
        return true;
      },
      publishWeixinDraft: async () => ({
        ok: true,
        postId: '10086',
        url: 'https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=10086',
        verified: true,
      }),
      publishMultiPlatform: async (payload: {
        targets: Array<{ platformId: string; mode: string }>;
        socialThemeId?: string;
        socialCoverRatio?: string;
      }) => {
        (window as unknown as { __lastPublishPayload?: unknown }).__lastPublishPayload = payload;
        return {
          results: payload.targets.map((t) => ({
            platformId: t.platformId,
            ok: true,
            mode: t.mode,
            postId: `post-${t.platformId}`,
            url: `https://example.com/draft/${t.platformId}`,
            verified: true,
            uploadedImagesCount: 2,
            message: `已完成分发（转存 2 张防盗链图片）`,
          })),
        };
      },
    };
  }, initialMarkdown);

  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('Phase 2 PublishModal & WeChat Preview E2E', () => {
  test('打开发布弹窗：支持头图/作者/摘要设置、小红书卡片表格清洗、批量勾选与内置沙箱浏览器直达草稿', async ({ page }) => {
    const md = [
      '# 公众号标题',
      '',
      '正文包含 **加粗** 与 [外部资料](https://example.com/a)。',
      '',
      '![本地配图](./assets/demo.png)',
      '',
      '> [!NOTE]',
      '> 重点提示卡片',
      '',
      '---',
      '',
      '## 平台对比',
      '| 平台 | 模式 |',
      '| :--- | :--- |',
      '| 微信公众号 | 草稿箱 |',
    ].join('\n');
    await openEditorWithArticle(page, md);

    await page.getByRole('button', { name: '分发' }).click();
    const preview = page.getByTestId('weixin-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('公众号标题');
    await expect(preview).toContainText('参考链接');
    await expect(preview).toContainText('ℹ️ 提示');
    await expect(preview).not.toContainText('[!NOTE]');
    await expect(preview.locator('img[src="vcat-asset://local/assets/demo.png"]')).toBeVisible();

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

    // Switch platform previews: Zhihu, Baijiahao, Xiaohongshu 3:4 cards & Douyin 3:4 cards
    await page.getByRole('button', { name: '知乎专栏' }).click();
    await expect(page.getByTestId('zhihu-preview')).toContainText('公众号标题');
    await page.getByRole('button', { name: '百家号' }).click();
    await expect(page.getByTestId('baijiahao-preview')).toContainText('公众号标题');
    await page.getByRole('button', { name: '小红书 3:4 卡片' }).click();
    const xhsPreview = page.getByTestId('xiaohongshu-preview');
    await expect(xhsPreview).toContainText('公众号标题');
    await expect(xhsPreview).toContainText('‹ 备忘录');
    await expect(xhsPreview).toContainText('微信公众号：草稿箱');
    await expect(xhsPreview).not.toContainText('| :--- |');
    await expect(xhsPreview).toHaveAttribute('data-theme-id', 'ios-memo');
    await expect(xhsPreview).toHaveAttribute('data-cover-ratio', '3:4');
    await page.getByRole('button', { name: '极简杂志', exact: true }).click();
    await expect(xhsPreview).toHaveAttribute('data-theme-id', 'minimalist-magazine');
    await page.getByRole('button', { name: '空白模板', exact: true }).click();
    await expect(xhsPreview).toHaveAttribute('data-theme-id', 'blank');
    await page.getByRole('button', { name: '16:9', exact: true }).click();
    await expect(xhsPreview).toHaveAttribute('data-cover-ratio', '16:9');
    await expect(page.getByTestId('social-image-mode-cards')).toBeVisible();
    await page.getByTestId('social-image-mode-article').click();
    await page.getByRole('button', { name: '抖音 3:4 图文' }).click();
    await expect(page.getByTestId('douyin-preview')).toContainText('公众号标题');
    await page.getByRole('button', { name: '微信公众号', exact: true }).click();
    await expect(preview).toBeVisible();

    // Switch to 多平台分发 / Git tab, verify batch select, auth states and pre-flight interception
    await page.getByRole('button', { name: '多平台分发 / Git' }).click();
    await expect(page.getByRole('button', { name: '刷新账号检测状态' })).toBeVisible();

    await page.getByRole('button', { name: '全选全部' }).click();
    await expect(page.getByRole('button', { name: /一键分发至所选平台 \(11\)/ })).toBeVisible();
    await page.getByRole('button', { name: '清空' }).click();
    await expect(page.getByRole('button', { name: /一键分发至所选平台 \(0\)/ })).toBeVisible();
    await page.getByRole('button', { name: '全选已授权' }).click();
    await expect(page.getByRole('button', { name: /一键分发至所选平台 \(2\)/ })).toBeVisible();

    // Also check Cnblogs (unauthed) to trigger Pre-flight check
    await page.getByRole('checkbox', { name: /博客园 \(Cnblogs\)/ }).check();

    // Trigger publish -> should be intercepted by Pre-flight check
    await page.getByRole('button', { name: /一键分发至所选平台 \(3\)/ }).click();
    await expect(page.getByText('⚠️ 前置强校验拦截：检测到以下已勾选平台尚未完成授权登录')).toBeVisible();
    await expect(page.getByText('博客园 (Cnblogs)').first()).toBeVisible();

    // Click "一键排除故障平台，继续发布健康平台"
    await page.getByRole('button', { name: /一键排除故障平台，继续发布健康平台 \(2\)/ }).click();
    await expect(page.getByText(/已完成分发（转存 2 张防盗链图片）（ID: post-weixin）/)).toBeVisible();
    await expect(page.getByText(/已完成分发（转存 2 张防盗链图片）（ID: post-github_static）/)).toBeVisible();
    const draftLink = page.locator('a[href="https://example.com/draft/weixin"]');
    await expect(draftLink).toHaveText('打开草稿 / 查看链接');
    await expect(draftLink).toHaveAttribute('target', '_blank');
    await expect(draftLink).toHaveAttribute('rel', 'noreferrer');
    await draftLink.click();

    // Switch to 🌐 平台快捷浏览器 icon grid tab and launch WeChat sandbox browser
    await page.getByRole('button', { name: '🌐 平台快捷浏览器' }).click();
    const browserGrid = page.getByTestId('platform-browser-grid');
    await expect(browserGrid).toBeVisible();
    await browserGrid.getByRole('button', { name: /微信公众号/ }).click();

    const browserCalls = await page.evaluate(
      () => (window as unknown as { __openedBrowserCalls?: Array<{ platformId: string; url: string }> }).__openedBrowserCalls
    );
    expect(browserCalls).toEqual([
      { platformId: 'weixin', url: 'https://example.com/draft/weixin' },
      { platformId: 'weixin', url: 'https://mp.weixin.qq.com/' },
    ]);

    const lastPayload = await page.evaluate(
      () => (window as unknown as { __lastPublishPayload?: Record<string, unknown> }).__lastPublishPayload
    );
    expect(lastPayload?.socialThemeId).toBe('blank');
    expect(lastPayload?.socialCoverRatio).toBe('16:9');
    expect(lastPayload?.socialImageMode).toBe('article_images');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(browserGrid).toBeHidden();
  });
});
