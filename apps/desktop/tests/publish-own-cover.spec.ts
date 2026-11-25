import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const MD = '# 公众号文章：多平台发布流程\n\n正文。\n\n![配图](./assets/demo.png)\n';
const PNG = { name: 'own.png', mimeType: 'image/png', buffer: Buffer.from('png') };
const COMMON = 'assets/common.png';
const base = {
  md: MD,
  auth: { weixin: true, zhihu: true, juejin: true, xiaohongshu: true },
  selected: ['weixin', 'zhihu'],
  saved: { title: '公众号文章：多平台发布流程', coverUpload: COMMON },
};

test.describe('单独封面：通用封面仍是默认；公众号和封面比例不同的平台可以单独设一张', () => {
  test('公众号块有「单独封面（可选）」入口；设置后公众号推送用它，知乎仍用通用封面', async ({ page }) => {
    await openPublishWith(page, base);
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    await expect(wx).toContainText('单独封面（可选）');
    await expect(wx).toContainText('推荐 2.35:1（900×383）');
    await wx.getByTestId('own-cover-input-weixin').setInputFiles(PNG);
    await expect(wx.getByTestId('own-cover-weixin')).toBeVisible();
    await expect(wx).toContainText('使用单独封面');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.weixinSquareCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.zhihu.coverImageUrl).toBe(COMMON);
  });

  test('不设单独封面：公众号用通用封面；移除单独封面后回到通用封面', async ({ page }) => {
    await openPublishWith(page, base);
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    await expect(wx).toContainText('使用通用封面');
    await wx.getByTestId('own-cover-input-weixin').setInputFiles(PNG);
    await wx.getByTestId('own-cover-weixin').getByRole('button', { name: '移除' }).click();
    await expect(wx.getByTestId('own-cover-weixin')).toHaveCount(0);
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toBe(COMMON);
    expect(calls.weixin.weixinSquareCoverImagePath).toBe(COMMON);
  });

  test('其他平台：只有封面比例和通用封面不同的平台（小红书 3:4）在自己的块里出现「为该平台单独设置封面」，知乎/掘金（16:9）没有', async ({ page }) => {
    await openPublishWith(page, { ...base, selected: ['zhihu', 'juejin', 'xiaohongshu'], saved: { ...base.saved, juejinCategoryId: '6809637769959178254', tags: ['写作'], digest: '一'.repeat(60) } });
    await expect(page.getByTestId('general-section')).not.toContainText('3:4'); // 通用区不出现比例，入口在小红书块里
    const social = page.getByTestId('section-social');
    await social.getByRole('button', { expanded: false }).click();
    const entries = social.getByTestId('own-cover-entries');
    await expect(entries.getByRole('button', { name: '为小红书单独设置封面' })).toBeVisible();
    await expect(page.getByRole('button', { name: /为知乎|为掘金/ })).toHaveCount(0);
    await entries.getByTestId('own-cover-input-xiaohongshu').setInputFiles(PNG);
    await expect(entries.getByTestId('own-cover-xiaohongshu').getByTestId('cover-focus')).toBeVisible();
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(3);
    const calls = await publishedCalls(page);
    expect(calls.xiaohongshu.socialCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.zhihu.coverImageUrl).toBe(COMMON);
    expect(calls.juejin.coverImageUrl).toBe(COMMON);
  });

  test('旧版本记住的公众号单独封面不丢：打开后仍在公众号块里，推送用它', async ({ page }) => {
    await openPublishWith(page, { ...base, saved: { ...base.saved, weixin: { cover: 'assets/wx-old.png', focus: { x: 20, y: 30 } } } });
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    await expect(wx.getByTestId('own-cover-weixin')).toBeVisible();
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toBe('assets/wx-old.png');
    expect(calls.zhihu.coverImageUrl).toBe(COMMON);
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：公众号单独封面 + 其他平台单独封面入口`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openPublishWith(page, { ...base, selected: ['weixin', 'zhihu', 'xiaohongshu'], saved: {}, theme, sampleImage: true });
      await page.getByTestId('cover-input').setInputFiles(PNG);
      const social = page.getByTestId('section-social');
      await social.getByRole('button', { expanded: false }).click();
      await social.getByTestId('own-cover-entries').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await shot(page, testInfo, `own-cover-entries-${mode}`);
      const wx = page.getByTestId('section-weixin');
      await wx.getByRole('button', { expanded: false }).click();
      await wx.getByTestId('own-cover-input-weixin').setInputFiles(PNG);
      await expect(wx.getByTestId('cover-focus')).toBeVisible();
      await wx.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await shot(page, testInfo, `weixin-own-cover-${mode}`);
    });
  }
});
