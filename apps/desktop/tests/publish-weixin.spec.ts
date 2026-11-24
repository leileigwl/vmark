import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const MD = '# 公众号文章：多平台发布流程\n\n正文。\n\n![配图](./assets/demo.png)\n';
const PNG = { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') };
const base = { md: MD, auth: { weixin: true, zhihu: true }, selected: ['weixin', 'zhihu'] };

test.describe('公众号块：只看封面裁剪（通用封面或正文首图按 2.35:1 + 1:1 裁切的预览）', () => {
  test('没有作者、阅读原文等字段，也没有单独的上传封面入口；上传通用封面后公众号块显示两种比例的裁切', async ({ page }) => {
    await openPublishWith(page, base);
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    for (const id of ['#wx-author', '#wx-source', '#wx-title', '#wx-digest']) await expect(page.locator(id)).toHaveCount(0);
    await expect(wx).not.toContainText('作者');
    await expect(wx).not.toContainText('阅读原文');
    await expect(wx).toContainText('列表大图 2.35:1');
    await expect(wx).toContainText('转发小图 1:1');
    await expect(wx).toContainText('用正文首图自动裁');
    await expect(wx.locator('input[type=file]')).toHaveCount(0);
    await expect(wx.getByRole('button', { name: /上传|更换|移除/ })).toHaveCount(0);
    await page.getByTestId('cover-input').setInputFiles(PNG);
    await expect(page.getByTestId('cover-field').getByTestId('cover-focus')).toBeVisible();
    for (const r of ['2.35:1', '1:1']) await expect(wx.getByAltText(`${r} 封面预览`)).toBeVisible();
    await expect(wx).toContainText('用通用封面按焦点裁');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.weixinSquareCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.author).toBeUndefined();
    expect(calls.weixin.sourceUrl).toBeUndefined();
    expect(calls.zhihu.coverImageUrl).toMatch(/assets\/up\.png$/); // 同一张通用封面也给知乎
  });

  test('正文没有图片也没传封面：公众号块提示去上方通用内容里上传', async ({ page }) => {
    await openPublishWith(page, { ...base, md: '# 公众号文章：多平台发布流程\n\n正文。\n' });
    const wx = page.getByTestId('section-weixin');
    await expect(wx).toContainText('缺封面');
    await wx.getByRole('button', { expanded: false }).click();
    await expect(wx).toContainText('正文没有图片，请上传一张封面（在上方通用内容里）');
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：公众号块只有封面裁剪与排版`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { ...base, theme, sampleImage: true });
      await page.getByTestId('cover-input').setInputFiles(PNG);
      const wx = page.getByTestId('section-weixin');
      await wx.getByRole('button', { expanded: false }).click();
      await expect(wx.getByAltText('1:1 封面预览')).toBeVisible();
      await page.getByTestId('cover-field').getByTestId('cover-focus').click({ position: { x: 35, y: 35 } }); // 焦点点在主体上，两种比例都以它为中心
      await expect(wx.getByAltText('2.35:1 封面预览')).not.toHaveAttribute('style', /50% 50%/);
      await wx.scrollIntoViewIfNeeded();
      await shot(page, testInfo, `weixin-cover-${mode}`);
    });
  }
});
