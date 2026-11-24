import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const MD = '# 公众号文章：多平台发布流程\n\n正文。\n\n![配图](./assets/demo.png)\n';
const PNG = { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') };
const base = { md: MD, auth: { weixin: true, zhihu: true }, selected: ['weixin', 'zhihu'] };

test.describe('公众号块：只留封面（上传、2.35:1 + 1:1 比例、焦点裁切预览）', () => {
  test('没有作者、阅读原文等字段；封面上传入口和两种比例都在公众号块里', async ({ page }) => {
    await openPublishWith(page, base);
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    for (const id of ['#wx-author', '#wx-source', '#wx-title', '#wx-digest']) await expect(page.locator(id)).toHaveCount(0);
    await expect(wx).not.toContainText('作者');
    await expect(wx).not.toContainText('阅读原文');
    await expect(wx).toContainText('列表大图 2.35:1');
    await expect(wx).toContainText('转发小图 1:1');
    await expect(wx).toContainText('用正文首图自动裁');
    await wx.getByTestId('weixin-cover-input').setInputFiles(PNG);
    await expect(wx.getByTestId('cover-focus')).toBeVisible();
    for (const r of ['2.35:1', '1:1']) await expect(wx.getByAltText(`${r} 封面预览`)).toBeVisible();
    await expect(page.getByTestId('cover-field').getByTestId('cover-focus')).toHaveCount(0); // 通用封面没被改
    await expect(wx).toContainText('公众号单独上传');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.weixinSquareCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.author).toBeUndefined();
    expect(calls.weixin.sourceUrl).toBeUndefined();
    expect(calls.zhihu.coverImageUrl).toBeUndefined(); // 公众号的封面只给公众号
  });

  test('只上传了通用封面：公众号块显示沿用通用封面的两种裁切', async ({ page }) => {
    await openPublishWith(page, base);
    await page.getByTestId('cover-input').setInputFiles(PNG);
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    await expect(wx).toContainText('沿用通用封面');
    for (const r of ['2.35:1', '1:1']) await expect(wx.getByAltText(`${r} 封面预览`)).toBeVisible();
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：公众号块只有封面与排版`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { ...base, theme, sampleImage: true });
      const wx = page.getByTestId('section-weixin');
      await wx.getByRole('button', { expanded: false }).click();
      await wx.getByTestId('weixin-cover-input').setInputFiles(PNG);
      await expect(wx.getByAltText('1:1 封面预览')).toBeVisible();
      await wx.getByTestId('cover-focus').click({ position: { x: 35, y: 35 } }); // 焦点点在主体上，两种比例都以它为中心
      await expect(wx.getByAltText('2.35:1 封面预览')).not.toHaveAttribute('style', /50% 50%/);
      await wx.scrollIntoViewIfNeeded();
      await shot(page, testInfo, `weixin-cover-${mode}`);
    });
  }
});
