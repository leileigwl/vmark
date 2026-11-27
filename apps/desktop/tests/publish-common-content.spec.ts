import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const TITLE = '把一篇长文同时推到十一个平台草稿箱的完整实践'; // 22 字
const TITLE25 = `${TITLE}三四五`; // 25 字，超过小红书 / 抖音 20 字
const MD = `# ${TITLE25}\n\n正文第一段。\n\n![配图](./assets/demo.png)\n`;
const setup = { md: MD, auth: { weixin: true, xiaohongshu: true, douyin: true }, selected: ['weixin', 'xiaohongshu', 'douyin'], saved: { title: TITLE25, tags: ['写作', '效率'], ownCovers: { weixin: { cover: 'assets/wx.png', focus: { x: 50, y: 50 } } } } };

test.describe('通用内容只写一份：小红书 · 抖音不再单独填标题 / 正文 / 话题 / 封面', () => {
  test('小红书 · 抖音块里只有卡片模板和预览，没有标题、正文、话题和单独封面输入框', async ({ page }) => {
    await openPublishWith(page, setup);
    const social = page.getByTestId('section-social');
    await social.getByRole('button', { expanded: false }).click();
    await expect(social.getByTestId('card-strip')).toBeVisible();
    await expect(social.locator('input, textarea')).toHaveCount(0);
    await expect(social.getByRole('button', { name: /上传封面/ })).toHaveCount(0);
    await expect(social.getByTestId('own-cover-entries')).toHaveCount(0);
    for (const n of ['小红书', '抖音']) await expect(social.getByRole('button', { name: `为${n}单独设置封面` })).toHaveCount(0);
    await expect(social).toContainText('有通用封面就原图插到卡片最前（平台自带封面裁切），没传就第一张卡片做封面');
  });

  test('通用标题 25 字：「需要单独处理」提示小红书 / 抖音标题自动截取，推送的是前 20 字，话题用通用标签', async ({ page }) => {
    await openPublishWith(page, setup);
    await expect(page.getByTestId('attention-xiaohongshu')).toContainText('小红书：标题超 5 字（自动截取）');
    await expect(page.getByTestId('attention-douyin')).toContainText('抖音：标题超 5 字（自动截取）');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 3 个草稿箱');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(3);
    const calls = await publishedCalls(page);
    expect(calls.xiaohongshu.title).toBe([...TITLE25].slice(0, 20).join(''));
    expect(calls.douyin.title).toBe([...TITLE25].slice(0, 20).join(''));
    expect(calls.weixin.title).toBe(TITLE25);
    expect(calls.xiaohongshu.tags).toEqual(['写作', '效率']);
    expect(calls.xiaohongshu.socialCoverImagePath).toBeUndefined();
  });

  test('上传通用封面后，小红书 / 抖音把它作为第 1 张卡片推送', async ({ page }) => {
    await openPublishWith(page, setup);
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(3);
    const calls = await publishedCalls(page);
    expect(calls.xiaohongshu.socialCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.douyin.socialCoverImagePath).toMatch(/assets\/up\.png$/);
  });

  test('摘要框不能拖动大小，随内容自动变高，到上限后内部滚动', async ({ page }) => {
    await openPublishWith(page, setup);
    const digest = page.locator('#pub-digest');
    expect(await digest.evaluate((el) => getComputedStyle(el).resize)).toBe('none');
    await digest.fill('短');
    const h1 = await digest.evaluate((el) => el.getBoundingClientRect().height);
    await digest.fill('一段比较长的摘要。'.repeat(20));
    const h2 = await digest.evaluate((el) => el.getBoundingClientRect().height);
    expect(h2).toBeGreaterThan(h1);
    await digest.fill('一段比较长的摘要。'.repeat(200));
    const tall = await digest.evaluate((el) => ({ h: el.getBoundingClientRect().height, scroll: el.scrollHeight, client: el.clientHeight, oy: getComputedStyle(el).overflowY }));
    expect(tall.h).toBeLessThanOrEqual(241);
    expect(tall.scroll).toBeGreaterThan(tall.client);
    expect(tall.oy).toBe('auto');
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：通用内容 + 小红书 · 抖音块`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openPublishWith(page, { ...setup, saved: { ...setup.saved, digest: '这是一段写给所有平台共用的摘要，会随内容自动变高。'.repeat(3) }, theme });
      await shot(page, testInfo, `publish-common-top-${mode}`);
      await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
      await page.getByTestId('section-social').evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await shot(page, testInfo, `publish-common-social-${mode}`);
    });
  }
});
