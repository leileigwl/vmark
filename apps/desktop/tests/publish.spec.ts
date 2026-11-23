import { expect, test, type Page } from '@playwright/test';

const MD = [
  '# 公众号标题：一篇关于多平台发布流程的长文测试',
  '',
  '正文包含 **加粗** 与 [外部资料](https://example.com/a)。',
  '',
  '![本地配图](./assets/demo.png)',
].join('\n');

async function openEditor(page: Page, auth: Record<string, boolean>, md: string = MD) {
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
        saveLocalImage: async () => ({ relativeMarkdownPath: './assets/up.png', fullPath: '/tmp/vmark-pub-test/assets/up.png' }),
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
        publishMultiPlatform: async (payload: { targets: Array<{ platformId: string; mode: string }> }) => {
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
    { md, authMap: auth }
  );
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
}

async function openPublish(page: Page) {
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

type Call = {
  title: string;
  digest?: string;
  tags?: string[];
  coverImageUrl?: string;
  socialCoverImagePath?: string;
  targets: Array<{ platformId: string; mode: string }>;
};
const callsOf = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Call[] }).__calls);
const byPlatform = (calls: Call[]) => Object.fromEntries(calls.map((c) => [c.targets[0].platformId, c]));
const row = (page: Page, id: string) => page.getByTestId(`platform-row-${id}`);
const attention = (page: Page, id: string) => page.getByTestId(`attention-${id}`);
const JUEJIN_DIGEST = '这是一段专门为掘金准备的摘要，长度需要落在五十到一百字之间，所以这里多写几句，说明这篇文章讲的是多平台发布流程的设计与实现。';

test.describe('发布窗口：精简布局，默认推入草稿箱', () => {
  test('标题取自一级标题，默认勾选公众号，封面默认用正文首图，一键推入草稿箱', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    await expect(page.locator('#pub-title')).toHaveValue('公众号标题：一篇关于多平台发布流程的长文测试');
    await expect(row(page, 'weixin').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    await expect(row(page, 'weixin')).toContainText('就绪');
    await expect(page.getByTestId('cover-field')).toContainText('默认：正文首图');
    await expect(page.getByTestId('attention-empty')).toBeVisible();
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 1 个草稿箱');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);
    const calls = await callsOf(page);
    expect(calls).toHaveLength(1);
    expect(calls[0].targets[0].mode).toBe('draft');
    expect(calls[0].coverImageUrl).toBe('./assets/demo.png');
  });

  test('没有通用/单平台切换、恢复默认和公众号排版预览，规则改为悬停提示', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByRole('button', { name: /通用信息|恢复|重新提取|裁剪/ })).toHaveCount(0);
    await expect(dialog.getByText('规则待核实')).toHaveCount(0);
    await row(page, 'juejin').getByText('稀土掘金').hover();
    await expect(page.getByRole('tooltip')).toContainText('摘要必填 50–100 字');
  });

  test('小红书标题超 20 字：只列出这一行，点开改写后就绪，推送使用各自标题', async ({ page }) => {
    await openEditor(page, { weixin: true, xiaohongshu: true });
    await openPublish(page);
    await row(page, 'xiaohongshu').getByRole('checkbox').click();
    await expect(row(page, 'xiaohongshu')).toContainText('差 1 项');
    await expect(attention(page, 'xiaohongshu')).toContainText(/小红书：标题超 \d+ 字 · \d+ 张卡片/);
    await expect(attention(page, 'weixin')).toHaveCount(0);
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 1 个草稿箱');

    await attention(page, 'xiaohongshu').getByRole('button', { expanded: false }).click();
    await page.locator('#t-xiaohongshu').fill('多平台发布实测');
    await expect(row(page, 'xiaohongshu')).toContainText('就绪');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 2 个草稿箱');

    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = byPlatform(await callsOf(page));
    expect(calls.weixin.title).toBe('公众号标题：一篇关于多平台发布流程的长文测试');
    expect(calls.xiaohongshu.title).toBe('多平台发布实测');
    expect(calls.xiaohongshu.socialCoverImagePath).toBeUndefined();
    expect(calls.xiaohongshu.coverImageUrl).toBeUndefined();
  });

  test('未登录平台显示“未登录”和登录按钮；点登录不会改动勾选，登录后状态刷新', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: false });
    await openPublish(page);
    const r = row(page, 'zhihu');
    await expect(r).toContainText('未登录');
    await r.getByRole('button', { name: '登录' }).click();
    await expect(r.getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked');
    await expect(r.getByRole('button', { name: '登录' })).toHaveCount(0);
    await expect(r).not.toContainText('未登录');
  });

  test('勾选：点整行或点勾选框都只切换一次', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await openPublish(page);
    const box = row(page, 'zhihu').getByRole('checkbox');
    await box.click();
    await expect(box).toHaveAttribute('data-state', 'checked');
    await row(page, 'zhihu').getByText('知乎专栏').click();
    await expect(box).toHaveAttribute('data-state', 'unchecked');
    await row(page, 'zhihu').click({ position: { x: 200, y: 12 } });
    await expect(box).toHaveAttribute('data-state', 'checked');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 2 个草稿箱');
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


test.describe('发布窗口：逐平台问题、封面、卡片与结果', () => {
  test('掘金：摘要差 N 字、缺标签；就地补齐后焦点离开自动收起', async ({ page }) => {
    await openEditor(page, { weixin: true, juejin: true });
    await openPublish(page);
    await row(page, 'juejin').getByRole('checkbox').click();
    await page.locator('#pub-digest').fill('一'.repeat(38));
    await expect(attention(page, 'juejin')).toContainText('掘金：摘要差 12 字 · 缺标签');
    await attention(page, 'juejin').getByRole('button', { expanded: false }).click();
    await page.locator('#d-juejin').fill(JUEJIN_DIGEST);
    await page.locator('#g-juejin').fill('前端');
    await page.locator('#g-juejin').press('Enter');
    await expect(attention(page, 'juejin')).toContainText('已就绪');
    await page.locator('#pub-title').click();
    await expect(attention(page, 'juejin')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删除标签 前端' })).toBeVisible();
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 2 个草稿箱');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = byPlatform(await callsOf(page));
    expect(calls.juejin.digest).toBe(JUEJIN_DIGEST);
    expect(calls.juejin.tags).toEqual(['前端']);
    expect(calls.weixin.tags).toEqual(['前端']);
    expect(calls.weixin.digest).toBe('一'.repeat(38));
    expect(calls.juejin.coverImageUrl).toBeUndefined();
  });

  test('删除标签与退格删除都生效，删光后掘金重新出现在待处理里', async ({ page }) => {
    await openEditor(page, { juejin: true });
    await openPublish(page);
    await row(page, 'juejin').getByRole('checkbox').click();
    await page.locator('#pub-tags').fill('前端, 工具');
    await page.locator('#pub-tags').press('Enter');
    await expect(page.getByRole('button', { name: '删除标签 工具' })).toBeVisible();
    await page.getByRole('button', { name: '删除标签 工具' }).click();
    await expect(page.getByRole('button', { name: '删除标签 工具' })).toHaveCount(0);
    await page.locator('#pub-tags').press('Backspace');
    await expect(page.getByRole('button', { name: '删除标签 前端' })).toHaveCount(0);
    await expect(attention(page, 'juejin')).toContainText('缺标签');
  });

  test('在弹窗输入框里按 Cmd/Ctrl+B、Cmd/Ctrl+Z 不影响背后的编辑器', async ({ page }) => {
    await openEditor(page, { weixin: true });
    const editor = page.locator('.vditor-ir .vditor-reset');
    const before = await editor.innerHTML();
    await openPublish(page);
    const title = page.locator('#pub-title');
    await title.fill('新标题');
    for (const mod of ['Meta', 'Control']) {
      await title.press(`${mod}+b`);
      await title.press(`${mod}+z`);
      await title.press(`${mod}+Shift+z`);
    }
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await editor.innerHTML()).toBe(before);
  });

  test('正文没有图片：公众号显示“缺封面”，上传后就绪，推送带上传的封面', async ({ page }) => {
    await openEditor(page, { weixin: true }, '# 没有配图的文章\n\n只有文字。');
    await openPublish(page);
    await expect(page.getByTestId('cover-field')).toContainText('正文没有图片');
    await expect(attention(page, 'weixin')).toContainText('公众号：缺封面');
    await expect(page.getByTestId('publish-start')).toBeDisabled();
    await attention(page, 'weixin').getByRole('button', { expanded: false }).click();
    await expect(attention(page, 'weixin').getByRole('button', { name: '上传封面' })).toBeVisible();
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(page.getByAltText('2.35:1 封面预览')).toBeVisible();
    await expect(page.getByAltText('1:1 封面预览')).toBeVisible();
    await expect(row(page, 'weixin')).toContainText('就绪');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);
    const calls = await callsOf(page);
    expect(calls[0].coverImageUrl).toMatch(/assets\/up\.png$/);
  });

  test('上传封面后：知乎 16:9、小红书 3:4 作为第 1 张；移除后回到默认', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true, xiaohongshu: true });
    await openPublish(page);
    await row(page, 'zhihu').getByRole('checkbox').click();
    await row(page, 'xiaohongshu').getByRole('checkbox').click();
    await expect(page.getByTestId('cover-field')).toContainText('默认：第一张卡 / 正文首图');
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    for (const r of ['2.35:1', '1:1', '16:9', '3:4']) await expect(page.getByAltText(`${r} 封面预览`)).toBeVisible();
    await page.getByTestId('cover-field').getByRole('button', { name: '移除' }).click();
    await expect(page.getByAltText('16:9 封面预览')).toHaveCount(0);
    await expect(page.getByTestId('cover-field')).toContainText('默认：第一张卡 / 正文首图');
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await attention(page, 'xiaohongshu').getByRole('button', { expanded: false }).click();
    await page.locator('#t-xiaohongshu').fill('多平台发布实测');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(3);
    const calls = byPlatform(await callsOf(page));
    expect(calls.zhihu.coverImageUrl).toMatch(/assets\/up\.png$/);
    expect(calls.xiaohongshu.socialCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.xiaohongshu.coverImageUrl).toBeUndefined();
  });

  test('小红书：卡片缩略图收在行里默认收起，展开后可切换模板', async ({ page }) => {
    await openEditor(page, { xiaohongshu: true });
    await openPublish(page);
    await row(page, 'xiaohongshu').getByRole('checkbox').click();
    const templates = page.getByRole('radiogroup', { name: '卡片模板' }).getByRole('radio');
    await expect(templates).toHaveCount(0);
    await attention(page, 'xiaohongshu').getByRole('button', { expanded: false }).click();
    await expect(page.getByText(/共 \d+ 张 3:4 卡片，平台上限 18 张/)).toBeVisible();
    await expect(templates).toHaveCount(4);
    await templates.nth(1).click();
    await expect(templates.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(templates.nth(0)).toHaveAttribute('aria-checked', 'false');
  });

  test('推送失败的平台可单独重试，返回修改不丢失勾选', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await page.evaluate(() => ((window as unknown as { __failOnce: string[] }).__failOnce = ['zhihu']));
    await openPublish(page);
    await row(page, 'zhihu').getByRole('checkbox').click();
    await page.getByTestId('publish-start').click();
    const results = page.getByTestId('publish-results');
    await expect(results.locator('[data-state="failed"]')).toHaveCount(1);
    await expect(results).toContainText('登录已过期');
    await expect(page.getByText('1 个成功，1 个失败')).toBeVisible();
    await page.getByRole('button', { name: '重试失败的 1 个' }).click();
    await expect(results.locator('[data-state="ok"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '去草稿箱' })).toHaveCount(2);
    await page.getByRole('button', { name: '返回修改' }).click();
    await expect(row(page, 'zhihu').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
  });

  test('关闭后重新打开，仍记得这篇文章的勾选和改写', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await openPublish(page);
    await row(page, 'zhihu').getByRole('checkbox').click();
    await page.locator('#pub-title').fill('改过的标题');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openPublish(page);
    await expect(page.locator('#pub-title')).toHaveValue('改过的标题');
    await expect(row(page, 'zhihu').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
  });
});
