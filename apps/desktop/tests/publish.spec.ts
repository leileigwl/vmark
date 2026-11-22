import { expect, test, type Page } from '@playwright/test';

const MD = [
  '# 公众号标题：一篇关于多平台发布流程的长文测试',
  '',
  '正文包含 **加粗** 与 [外部资料](https://example.com/a)。',
  '',
  '![本地配图](./assets/demo.png)',
].join('\n');

async function openEditor(page: Page, auth: Record<string, boolean>) {
  await page.addInitScript(
    ({ md, authMap }: { md: string; authMap: Record<string, boolean> }) => {
      const articleMeta = {
        id: 'pub-1',
        title: 'publish-demo',
        relativePath: 'publish-demo.md',
        folder: '',
        wordCount: 40,
        updatedAt: Date.now(),
        imageCount: 1,
        hasFrontmatter: false,
        excerpt: '',
      };
      const w = window as unknown as { __calls: unknown[]; electronAPI: Record<string, unknown> };
      w.__calls = [];
      w.electronAPI = {
        getWorkspacePath: async () => '/tmp/vmark-pub-test',
        getRecentWorkspaces: async () => ['/tmp/vmark-pub-test'],
        listArticles: async () => [articleMeta],
        listFolders: async () => [],
        getImageBedConfig: async () => ({ strategy: 'platform_private' }),
        getStartupConfig: async () => ({ lastArticlePath: 'publish-demo.md', theme: 'apple-light' }),
        getPlatformAuthStates: async () => ({ ...authMap }),
        getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
        readArticle: async () => md,
        saveArticle: async () => ({ ok: true }),
        saveStartupConfig: async () => ({ ok: true }),
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: () => () => {},
        openPlatformLogin: async (pid: string) => {
          authMap[pid] = true;
          return true;
        },
        logoutPlatform: async (pid: string) => {
          authMap[pid] = false;
          return true;
        },
        publishMultiPlatform: async (payload: { title: string; targets: Array<{ platformId: string; mode: string }> }) => {
          w.__calls.push(payload);
          const failOnce = (window as unknown as { __failOnce?: string[] }).__failOnce ?? [];
          return {
            results: payload.targets.map((t) => {
              const fail = failOnce.includes(t.platformId);
              if (fail) failOnce.splice(failOnce.indexOf(t.platformId), 1);
              return {
              platformId: t.platformId,
              ok: !fail,
              mode: t.mode,
              url: `https://example.com/draft/${t.platformId}`,
              message: fail ? '登录已过期' : '已推送',
              };
            }),
          };
        },
      };
    },
    { md: MD, authMap: auth }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

async function openPublish(page: Page) {
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('发布窗口：逐平台适配并推入草稿箱', () => {
  test('标题取自一级标题，默认勾选公众号，一键推入草稿箱', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    await expect(page.locator('#pub-title')).toHaveValue('公众号标题：一篇关于多平台发布流程的长文测试');
    await expect(page.getByTestId('platform-row-weixin').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);
    const calls = await page.evaluate(() => (window as unknown as { __calls: Array<{ targets: Array<{ mode: string }> }> }).__calls);
    expect(calls).toHaveLength(1);
    expect(calls[0].targets[0].mode).toBe('draft');
  });

  test('小红书标题超 20 字会被拦下，单独改写后就绪，且推送使用各自标题', async ({ page }) => {
    await openEditor(page, { weixin: true, xiaohongshu: true });
    await openPublish(page);
    await page.getByTestId('platform-row-xiaohongshu').getByRole('checkbox').click();
    await expect(page.getByTestId('platform-row-xiaohongshu')).toContainText('项待补');
    await expect(page.getByTestId('publish-start')).toHaveText(/推送已就绪的 1 个/);

    await page.getByTestId('platform-row-xiaohongshu').click();
    await page.locator('#t-xiaohongshu').fill('多平台发布实测');
    await expect(page.getByTestId('platform-row-xiaohongshu')).not.toContainText('项待补');
    await expect(page.getByTestId('publish-start')).toHaveText(/推送到草稿箱 \(2\)/);

    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const titles = await page.evaluate(() =>
      (window as unknown as { __calls: Array<{ title: string; targets: Array<{ platformId: string }> }> }).__calls.map((c) => [c.targets[0].platformId, c.title])
    );
    expect(Object.fromEntries(titles)).toEqual({
      weixin: '公众号标题：一篇关于多平台发布流程的长文测试',
      xiaohongshu: '多平台发布实测',
    });
  });

  test('未登录平台不推送，可在列表里直接登录', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: false });
    await openPublish(page);
    const row = page.getByTestId('platform-row-zhihu');
    await row.getByRole('checkbox').click();
    await expect(row.getByRole('button', { name: '去登录' })).toBeVisible();
    await expect(page.getByTestId('publish-start')).toHaveText(/推送已就绪的 1 个/);
    await row.getByRole('button', { name: '去登录' }).click();
    await expect(row.getByRole('button', { name: '去登录' })).toHaveCount(0);
  });
});

test('设置页与发布窗口读同一份登录状态', async ({ page }) => {
  await openEditor(page, { weixin: true, cnblogs: false });
  await page.getByTitle('偏好设置').click();
  await page.getByRole('button', { name: '平台账号' }).click();
  await expect(page.getByTestId('account-weixin').locator('[data-auth-status]')).toHaveAttribute('data-auth-status', 'signedIn');
  await expect(page.getByTestId('account-cnblogs').locator('[data-auth-status]')).toHaveAttribute('data-auth-status', 'signedOut');
  await page.getByTestId('account-weixin').getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await expect(page.getByTestId('account-weixin').locator('[data-auth-status]')).toHaveAttribute('data-auth-status', 'signedOut');
});

test.describe('发布窗口：字段规则、封面、卡片与结果', () => {
  test('掘金：摘要长度与标签必填都会提示，补齐后就绪', async ({ page }) => {
    await openEditor(page, { weixin: true, juejin: true });
    await openPublish(page);
    await page.getByTestId('platform-row-juejin').getByRole('checkbox').click();
    await page.getByTestId('platform-row-juejin').click();
    await expect(page.getByText('摘要必填 50–100 字')).toBeVisible();
    await expect(page.getByText('至少需要 1 个标签')).toBeVisible();
    await page.locator('#d-juejin').fill('太短');
    await expect(page.getByText('摘要至少 50 字')).toBeVisible();
    await page.locator('#d-juejin').fill('这是一段专门为掘金准备的摘要，长度需要落在五十到一百字之间，所以这里多写几句，说明这篇文章讲的是多平台发布流程的设计与实现。');
    await expect(page.getByText('摘要至少 50 字')).toHaveCount(0);
    await page.getByRole('button', { name: '通用信息', exact: true }).click();
    await page.locator('#pub-tags').fill('前端');
    await page.locator('#pub-tags').press('Enter');
    await expect(page.getByRole('button', { name: '删除标签 前端' })).toBeVisible();
    await expect(page.getByTestId('platform-row-juejin')).not.toContainText('项待补');
    await expect(page.getByTestId('publish-start')).toHaveText(/推送到草稿箱 \(2\)/);
  });

  test('单独改写可以一键恢复通用信息', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    await page.getByTestId('platform-row-weixin').click();
    await page.locator('#t-weixin').fill('公众号专用标题');
    await expect(page.getByText('该平台使用单独改写的内容。')).toBeVisible();
    await page.getByRole('button', { name: '恢复通用信息' }).click();
    await expect(page.locator('#t-weixin')).toHaveValue('公众号标题：一篇关于多平台发布流程的长文测试');
    await expect(page.getByRole('button', { name: '恢复通用信息' })).toHaveCount(0);
  });

  test('摘要改动后可重新提取', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    const auto = await page.locator('#pub-digest').inputValue();
    expect(auto.length).toBeGreaterThan(0);
    await page.locator('#pub-digest').fill('手写摘要');
    await page.getByRole('button', { name: '重新提取' }).click();
    await expect(page.locator('#pub-digest')).toHaveValue(auto);
  });

  test('封面：列出正文图片，按已选平台列出需要的比例', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true, xiaohongshu: true });
    await openPublish(page);
    await expect(page.getByRole('button', { name: '用这张图做封面' })).toHaveCount(1);
    await expect(page.getByAltText('2.35:1 封面预览')).toBeVisible();
    await expect(page.getByAltText('16:9 封面预览')).toHaveCount(0);
    await page.getByTestId('platform-row-zhihu').getByRole('checkbox').click();
    await page.getByTestId('platform-row-xiaohongshu').getByRole('checkbox').click();
    await page.getByRole('button', { name: '通用信息', exact: true }).click();
    await expect(page.getByAltText('16:9 封面预览')).toBeVisible();
    await expect(page.getByAltText('3:4 封面预览')).toBeVisible();
    await expect(page.getByRole('button', { name: '裁剪全部比例' })).toBeEnabled();
  });

  test('小红书：显示卡片张数并可切换模板', async ({ page }) => {
    await openEditor(page, { xiaohongshu: true });
    await openPublish(page);
    await page.getByTestId('platform-row-xiaohongshu').getByRole('checkbox').click();
    await page.getByTestId('platform-row-xiaohongshu').click();
    await expect(page.getByText(/共 \d+ 张 3:4 卡片，平台上限 18 张/)).toBeVisible();
    const templates = page.getByRole('radiogroup', { name: '卡片模板' }).getByRole('radio');
    await expect(templates).toHaveCount(5);
    await templates.nth(1).click();
    await expect(templates.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(templates.nth(0)).toHaveAttribute('aria-checked', 'false');
  });

  test('公众号更多菜单：复制富文本、打开后台、退出登录', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    await page.getByTestId('platform-row-weixin').click();
    await page.getByRole('dialog').getByRole('button', { name: '更多操作' }).click();
    await expect(page.getByRole('menuitem', { name: '复制公众号富文本' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '打开平台后台' })).toBeVisible();
    await page.getByRole('menuitem', { name: '退出登录' }).click();
    await expect(page.getByRole('button', { name: '登录微信公众号' })).toBeVisible();
    await expect(page.getByTestId('publish-start')).toBeDisabled();
  });

  test('推送失败的平台可单独重试，返回修改不丢失勾选', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await page.evaluate(() => ((window as unknown as { __failOnce: string[] }).__failOnce = ['zhihu']));
    await openPublish(page);
    await page.getByTestId('platform-row-zhihu').getByRole('checkbox').click();
    await page.getByTestId('publish-start').click();
    const results = page.getByTestId('publish-results');
    await expect(results.locator('[data-state="failed"]')).toHaveCount(1);
    await expect(results).toContainText('登录已过期');
    await expect(page.getByText('1 个成功，1 个失败')).toBeVisible();
    await page.getByRole('button', { name: '重试失败的 1 个' }).click();
    await expect(results.locator('[data-state="ok"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '去草稿箱' })).toHaveCount(2);
    await page.getByRole('button', { name: '返回修改' }).click();
    await expect(page.getByTestId('platform-row-zhihu').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
  });

  test('关闭后重新打开，仍记得这篇文章的勾选和改写', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await openPublish(page);
    await page.getByTestId('platform-row-zhihu').getByRole('checkbox').click();
    await page.locator('#pub-title').fill('改过的标题');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openPublish(page);
    await expect(page.locator('#pub-title')).toHaveValue('改过的标题');
    await expect(page.getByTestId('platform-row-zhihu').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
  });
});
