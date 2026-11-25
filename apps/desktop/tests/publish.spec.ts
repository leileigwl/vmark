import path from 'node:path';
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
      const w = window as unknown as { __calls: unknown[]; __opened: string[][]; electronAPI: Record<string, unknown> };
      w.__calls = [];
      w.__opened = [];
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
        openPlatformLogin: async (pid: string, url: string) => {
          w.__opened.push([pid, url]);
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
              urlKind: (window as unknown as { __urlKind?: Record<string, string> }).__urlKind?.[t.platformId],
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
  socialBody?: string;
  author?: string;
  sourceUrl?: string;
  weixinSquareCoverImagePath?: string;
  juejinCategoryId?: string;
  targets: Array<{ platformId: string; mode: string }>;
};
const callsOf = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Call[] }).__calls);
const byPlatform = (calls: Call[]) => Object.fromEntries(calls.map((c) => [c.targets[0].platformId, c]));
const row = (page: Page, id: string) => page.getByTestId(`platform-row-${id}`);
const attention = (page: Page, id: string) => page.getByTestId(`attention-${id}`);
const section = (page: Page, id: 'weixin' | 'social') => page.getByTestId(`section-${id}`);
const JUEJIN_DIGEST = '这是一段专门为掘金准备的摘要，长度需要落在五十到一百字之间，所以这里多写几句，说明这篇文章讲的是多平台发布流程的设计与实现。';

const PNG = { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') };

test.describe('发布窗口：精简布局，默认推入草稿箱', () => {
  test('标题、摘要、标签、封面默认全空，手动填写并上传封面后一键推入草稿箱', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    await expect(page.locator('#pub-title')).toHaveValue('');
    await expect(page.locator('#pub-digest')).toHaveValue('');
    await expect(row(page, 'weixin').getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    await expect(row(page, 'weixin')).toContainText('差 2 项');
    await expect(page.getByTestId('cover-hint')).toHaveText('推荐 16:9，公众号需封面');
    await section(page, 'weixin').getByRole('button', { expanded: false }).click();
    await expect(section(page, 'weixin')).toContainText('请上传一张封面（推荐 2.35:1，900×383）');
    await expect(page.getByTestId('weixin-preview')).toHaveCount(0); // 不再显示公众号排版预览
    await expect(page.getByTestId('publish-start')).toBeDisabled();
    await page.locator('#pub-title').fill('手动填写的公众号标题');
    await page.getByTestId('cover-input').setInputFiles(PNG);
    await expect(row(page, 'weixin')).toContainText('就绪');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 1 个草稿箱');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);
    const calls = await callsOf(page);
    expect(calls).toHaveLength(1);
    expect(calls[0].targets[0].mode).toBe('draft');
    expect(calls[0].title).toBe('手动填写的公众号标题');
    expect(calls[0].coverImageUrl).toMatch(/assets\/up\.png$/);
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

  test('小红书：标题默认从通用标题截取 20 字即可推送，「需要单独处理」里提示自动截取；在那里单独改写，超 20 字才报错', async ({ page }) => {
    await openEditor(page, { weixin: true, xiaohongshu: true });
    await openPublish(page);
    await page.locator('#pub-title').fill('公众号标题：一篇关于多平台发布流程的长文测试');
    await section(page, 'weixin').getByRole('button', { expanded: false }).click();
    await section(page, 'weixin').getByTestId('own-cover-input-weixin').setInputFiles(PNG);
    await row(page, 'xiaohongshu').getByRole('checkbox').click();
    await expect(row(page, 'xiaohongshu')).toContainText('就绪');
    await expect(section(page, 'social')).toContainText('标题「公众号标题：一篇关于多平台发布流程的长文」');
    await expect(attention(page, 'xiaohongshu')).toContainText('小红书：标题超 2 字（自动截取）'); // 只提示，不挡推送
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 2 个草稿箱');

    await attention(page, 'xiaohongshu').getByRole('button', { expanded: false }).click();
    await page.locator('#t-xiaohongshu').fill('一二三四五六七八九十一二三四五六七八九十一');
    await expect(row(page, 'xiaohongshu')).toContainText('差 1 项');
    await expect(section(page, 'social')).toContainText('小红书标题超 1 字');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 1 个草稿箱');
    await page.locator('#t-xiaohongshu').fill('多平台发布实测');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 2 个草稿箱');

    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = byPlatform(await callsOf(page));
    expect(calls.weixin.title).toBe('公众号标题：一篇关于多平台发布流程的长文测试');
    expect(calls.xiaohongshu.title).toBe('多平台发布实测');
    expect(calls.xiaohongshu.socialBody).toBeUndefined(); // 正文由主进程从文章转纯文本
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
    await page.locator('#pub-title').fill('测试标题');
    await page.getByTestId('cover-input').setInputFiles(PNG);
    const box = row(page, 'zhihu').getByRole('checkbox');
    await box.click();
    await expect(box).toHaveAttribute('data-state', 'checked');
    await row(page, 'zhihu').getByText('知乎专栏').click();
    await expect(box).toHaveAttribute('data-state', 'unchecked');
    // 行右侧是「内置浏览器」按钮，点名称后的空白处切换勾选
    await row(page, 'zhihu').click({ position: { x: 150, y: 12 } });
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
  test('掘金：摘要差 N 字、缺分类；通用区提示必填，就地补齐后焦点离开自动收起', async ({ page }) => {
    await openEditor(page, { weixin: true, juejin: true });
    await openPublish(page);
    await page.locator('#pub-title').fill('测试标题');
    await section(page, 'weixin').getByRole('button', { expanded: false }).click();
    await section(page, 'weixin').getByTestId('own-cover-input-weixin').setInputFiles(PNG);
    await row(page, 'juejin').getByRole('checkbox').click();
    await expect(page.getByTestId('general-section')).toContainText('掘金必填 50–100 字');
    await expect(page.getByTestId('general-section')).toContainText('掘金必填');
    await page.locator('#pub-digest').fill('一'.repeat(38));
    await expect(attention(page, 'juejin')).toContainText('掘金：摘要差 12 字 · 缺分类');
    await page.locator('#pub-tags').fill('前端');
    await page.locator('#pub-tags').press('Enter');
    await attention(page, 'juejin').getByRole('button', { expanded: false }).click();
    await page.locator('#d-juejin').fill(JUEJIN_DIGEST);
    await expect(attention(page, 'juejin')).toContainText('缺分类');
    await attention(page, 'juejin').getByRole('radio', { name: '前端' }).click();
    await expect(attention(page, 'juejin').getByRole('radio', { name: '前端' })).toHaveAttribute('aria-checked', 'true');
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
    expect(calls.juejin.juejinCategoryId).toBe('6809637767543259144');
    expect(calls.weixin.juejinCategoryId).toBeUndefined();
  });

  test('删除标签与退格删除都生效，删光后左侧平台行标出缺项且不重复弹出待处理框', async ({ page }) => {
    await openEditor(page, { juejin: true });
    await openPublish(page);
    await page.locator('#pub-title').fill('测试标题');
    await page.locator('#pub-digest').fill(JUEJIN_DIGEST);
    await row(page, 'juejin').getByRole('checkbox').click();
    await attention(page, 'juejin').getByRole('button', { expanded: false }).click();
    await attention(page, 'juejin').getByRole('radio', { name: '前端' }).click();
    await page.locator('#pub-tags').fill('前端, 工具');
    await page.locator('#pub-tags').press('Enter');
    await expect(row(page, 'juejin')).toContainText('内容就绪');
    await expect(page.getByRole('button', { name: '删除标签 工具' })).toBeVisible();
    await page.getByRole('button', { name: '删除标签 工具' }).click();
    await expect(page.getByRole('button', { name: '删除标签 工具' })).toHaveCount(0);
    await page.locator('#pub-tags').press('Backspace');
    await expect(page.getByRole('button', { name: '删除标签 前端' })).toHaveCount(0);
    await expect(row(page, 'juejin')).toContainText('差 1 项');
    await expect(attention(page, 'juejin')).toHaveCount(0);
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

  test('正文没有图片：公众号显示“缺封面”，上传后就绪，推送带上传的封面', async ({ page }, testInfo) => {
    await openEditor(page, { weixin: true }, '# 没有配图的文章\n\n只有文字。');
    await openPublish(page);
    await page.locator('#pub-title').fill('没有配图的文章');
    await expect(section(page, 'weixin')).toContainText('缺封面');
    await expect(page.getByTestId('publish-start')).toBeDisabled();
    await section(page, 'weixin').getByRole('button', { expanded: false }).click();
    await expect(page.getByTestId('weixin-cover')).toContainText('请上传一张封面（推荐 2.35:1，900×383）');
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(section(page, 'weixin').getByTestId('cover-focus')).toBeVisible();
    await expect(page.getByAltText('1:1 封面预览')).toHaveCount(0);
    await expect(row(page, 'weixin')).toContainText('就绪');
    const shotDir = process.env.PW_SCREENSHOT_DIR;
    await page.screenshot({ path: shotDir ? path.join(shotDir, 'weixin-square-cover.png') : testInfo.outputPath('weixin-square-cover.png') });
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);
    const calls = await callsOf(page);
    expect(calls[0].coverImageUrl).toMatch(/assets\/up\.png$/);
    // 1:1 转发图单独传（测试环境 canvas 读不到 vcat-asset，裁剪失败退回上传原图）
    expect(calls[0].weixinSquareCoverImagePath).toMatch(/assets\/up\.png$/);
  });

  test('通用封面给所有平台：文章平台按比例裁，小红书/抖音插到第一张卡前；移除后小红书回到第一张卡片做封面', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true, xiaohongshu: true });
    await openPublish(page);
    await page.locator('#pub-title').fill('通用封面测试标题');
    await row(page, 'zhihu').getByRole('checkbox').click();
    await row(page, 'xiaohongshu').getByRole('checkbox').click();
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(page.getByTestId('cover-field').getByTestId('cover-focus')).toBeVisible();
    await page.getByTestId('cover-field').getByRole('button', { name: '移除' }).click();
    await expect(page.getByTestId('cover-field').getByTestId('cover-focus')).toHaveCount(0);
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    // 公众号的封面预览在公众号分区里（不展示 1:1）
    await section(page, 'weixin').getByRole('button', { expanded: false }).click();
    await expect(section(page, 'weixin').getByTestId('cover-focus')).toBeVisible();
    await expect(section(page, 'weixin').getByAltText('1:1 封面预览')).toHaveCount(0);
    await section(page, 'social').getByRole('button', { expanded: false }).click();
    await expect(section(page, 'social').getByAltText('卡片封面（通用封面）')).toBeVisible();
    await expect(section(page, 'social')).toContainText('3 张卡片'); // 正文 2 张 + 通用封面 1 张
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(3);
    let calls = byPlatform(await callsOf(page));
    expect(calls.zhihu.coverImageUrl).toMatch(/assets\/up\.png$/);
    expect(calls.xiaohongshu.socialCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.xiaohongshu.coverImageUrl).toBeUndefined();

    await page.getByRole('button', { name: '返回修改' }).click();
    await page.getByTestId('cover-field').getByRole('button', { name: '移除' }).click();
    await expect(section(page, 'social').getByAltText('卡片封面（通用封面）')).toHaveCount(0);
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    calls = byPlatform(await callsOf(page));
    expect(calls.xiaohongshu.socialCoverImagePath).toBeUndefined();
    expect(calls.zhihu.coverImageUrl).toBeUndefined();
  });

  test('通用封面下只有一句短提示，不列 2.35:1/3:4 等特殊比例；平台规则悬停仍可看到', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true, juejin: true, baijiahao: true, xiaohongshu: true, douyin: true, cnblogs: true });
    await openPublish(page);
    for (const id of ['zhihu', 'juejin', 'baijiahao', 'xiaohongshu', 'douyin', 'cnblogs']) await row(page, id).getByRole('checkbox').click();
    await expect(page.getByTestId('cover-hint')).toHaveText('推荐 16:9，公众号、百家号需封面');
    await expect(page.getByTestId('cover-guide')).toHaveCount(0);
    await expect(page.getByTestId('general-section')).not.toContainText('列表右侧小图');
    await expect(page.getByTestId('general-section')).not.toContainText('第一张卡片就是封面');
    await expect(page.getByTestId('general-section')).not.toContainText('2.35:1');
    await row(page, 'baijiahao').getByText('百家号').hover();
    await expect(page.getByRole('tooltip')).toContainText('封面必需 16:9');
  });

  test('无通用封面时不在「需要单独处理」重复弹出上传框，上方提示需封面；知乎就绪', async ({ page }) => {
    await openEditor(page, { weixin: true, baijiahao: true, weibo: true, zhihu: true }, '# 没有配图的文章标题够长\n\n只有文字。');
    await openPublish(page);
    await page.locator('#pub-title').fill('没有配图的文章标题够长');
    await row(page, 'weixin').getByRole('checkbox').click();
    for (const id of ['baijiahao', 'weibo', 'zhihu']) await row(page, id).getByRole('checkbox').click();
    await expect(page.getByTestId('cover-hint')).toHaveText('推荐 16:9，百家号、微博需封面');
    await expect(attention(page, 'baijiahao')).toHaveCount(0);
    await expect(attention(page, 'weibo')).toHaveCount(0);
    await expect(attention(page, 'zhihu')).toHaveCount(0);
    await expect(row(page, 'baijiahao')).toContainText('差 1 项');
    await expect(row(page, 'weibo')).toContainText('差 1 项');
    await expect(row(page, 'zhihu')).toContainText('内容就绪');
  });

  test('公众号分区：没有作者与阅读原文；标题沿用通用，超长时在「需要单独处理」里改', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await openPublish(page);
    await page.getByTestId('cover-input').setInputFiles(PNG);
    await row(page, 'zhihu').getByRole('checkbox').click();
    await section(page, 'weixin').getByRole('button', { expanded: false }).click();
    for (const id of ['#wx-title', '#wx-author', '#wx-source']) await expect(page.locator(id)).toHaveCount(0);
    await page.locator('#pub-title').fill('公'.repeat(70));
    await expect(attention(page, 'weixin')).toContainText('公众号：标题超 6 字');
    await attention(page, 'weixin').getByRole('button', { expanded: false }).click();
    await page.locator('#t-weixin').fill('公众号标题：一篇关于多平台发布流程的长文测试');
    await expect(attention(page, 'weixin')).toContainText('已就绪');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = byPlatform(await callsOf(page));
    expect(calls.weixin.author).toBeUndefined();
    expect(calls.weixin.sourceUrl).toBeUndefined();
    expect(calls.weixin.title).toBe('公众号标题：一篇关于多平台发布流程的长文测试');
    expect(calls.zhihu.title).toBe('公'.repeat(70));
  });

  test('小红书：卡片缩略图收在「小红书 · 抖音」分区里默认收起，展开后可切换模板', async ({ page }) => {
    await openEditor(page, { xiaohongshu: true });
    await openPublish(page);
    await row(page, 'xiaohongshu').getByRole('checkbox').click();
    const templates = page.getByRole('radiogroup', { name: '卡片模板' }).getByRole('radio');
    await expect(templates).toHaveCount(0);
    await section(page, 'social').getByRole('button', { expanded: false }).click();
    await expect(page.getByText(/共 \d+ 张 3:4 卡片，平台上限 18 张/)).toBeVisible();
    await expect(templates).toHaveCount(7);
    await templates.nth(1).click();
    await expect(templates.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(templates.nth(0)).toHaveAttribute('aria-checked', 'false');
  });

  test('推送失败的平台可单独重试，返回修改不丢失勾选', async ({ page }) => {
    await openEditor(page, { weixin: true, zhihu: true });
    await page.evaluate(() => ((window as unknown as { __failOnce: string[] }).__failOnce = ['zhihu']));
    await openPublish(page);
    await page.locator('#pub-title').fill('测试标题');
    await page.getByTestId('cover-input').setInputFiles(PNG);
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

const openedOf = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[][] }).__opened);

test.describe('预览收进平台行、内置浏览器入口与打开草稿', () => {
  test('公众号分区点开只显示封面裁剪，不显示排版预览和「复制富文本」', async ({ page }) => {
    await openEditor(page, { weixin: true });
    await openPublish(page);
    await expect(page.getByRole('dialog').getByRole('tab')).toHaveCount(0); // 顶部没有「公众号排版」「平台快捷浏览器」标签页
    await section(page, 'weixin').getByRole('button', { name: /公众号/ }).click();
    await expect(page.getByTestId('weixin-cover')).toBeVisible();
    await expect(page.getByTestId('weixin-preview')).toHaveCount(0);
    await expect(section(page, 'weixin').getByRole('button', { name: '复制富文本' })).toHaveCount(0);
  });

  test('每个平台行有「内置浏览器」按钮：打开该平台后台，不改动勾选', async ({ page }) => {
    await openEditor(page, { weixin: true, juejin: true });
    await openPublish(page);
    const btn = page.getByTestId('open-browser-juejin');
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
    await btn.click();
    await expect(row(page, 'juejin').getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked');
    expect(await openedOf(page)).toEqual([['juejin', 'https://juejin.cn/creator/content/article/drafts']]);
  });

  test('推送成功且拿到草稿 id：「打开草稿」用内置浏览器打开这篇草稿；没有 id 时显示「去草稿箱」', async ({ page }) => {
    await openEditor(page, { weixin: true, juejin: true });
    await page.evaluate(() => {
      (window as unknown as { __urlKind: Record<string, string> }).__urlKind = { weixin: 'list', juejin: 'draft' };
    });
    await openPublish(page);
    await page.locator('#pub-title').fill('测试标题');
    await page.getByTestId('cover-input').setInputFiles(PNG);
    await row(page, 'juejin').getByRole('checkbox').click();
    await page.locator('#pub-digest').fill(JUEJIN_DIGEST);
    await page.locator('#pub-tags').fill('前端');
    await page.locator('#pub-tags').press('Enter');
    await attention(page, 'juejin').getByRole('button', { name: /掘金/ }).click();
    await page.getByRole('radio', { name: '前端' }).click();
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    await expect(page.getByTestId('open-result-weixin')).toHaveText('去草稿箱');
    await page.getByTestId('open-result-juejin').click();
    await expect(page.getByTestId('open-result-juejin')).toHaveText('打开草稿');
    expect((await openedOf(page)).at(-1)).toEqual(['juejin', 'https://example.com/draft/juejin']);
  });

  test('发布弹窗打开时 Cmd/Ctrl+B、1、K、F 不作用于背后的正文，也不打开查找', async ({ page }) => {
    await openEditor(page, { weixin: true });
    const before = await page.locator('.vditor-ir .vditor-reset').innerHTML();
    await openPublish(page);
    await page.getByTestId('open-browser-weixin').focus();
    for (const k of ['b', '1', 'k', 'f']) await page.keyboard.press(`ControlOrMeta+${k}`);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('input[placeholder*="查找"]')).toHaveCount(0);
    expect(await page.locator('.vditor-ir .vditor-reset').innerHTML()).toBe(before);
  });
});
