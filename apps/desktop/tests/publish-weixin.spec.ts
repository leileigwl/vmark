import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const MD = '# 公众号文章：多平台发布流程\n\n正文。\n\n![配图](./assets/demo.png)\n';
const PNG = { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') };
const base = { md: MD, auth: { weixin: true, zhihu: true }, selected: ['weixin', 'zhihu'] };

test.describe('公众号块：单行视觉对齐的封面设置 + 单击放大 + 2.35:1 裁剪', () => {
  test('无重复两行「封面裁剪」与 1:1 冗余展示；支持单击放大与复用通用封面裁剪', async ({ page }) => {
    await openPublishWith(page, base);
    const wx = page.getByTestId('section-weixin');
    await wx.getByRole('button', { expanded: false }).click();
    for (const id of ['#wx-author', '#wx-source', '#wx-title', '#wx-digest']) await expect(page.locator(id)).toHaveCount(0);
    await expect(wx).not.toContainText('作者');
    await expect(wx).not.toContainText('阅读原文');
    await expect(wx).not.toContainText('封面裁剪');
    await expect(wx).not.toContainText('转发小图');
    await expect(wx).not.toContainText('1:1');
    await expect(wx.getByTestId('weixin-preview')).toHaveCount(0);
    await expect(wx.getByRole('button', { name: '复制富文本' })).toHaveCount(0);
    await expect(wx).toContainText('使用正文首图 · 推荐 2.35:1（900×383）');
    await expect(wx.locator('input[type=file]')).toHaveCount(1);
    await expect(wx.getByRole('button', { name: /上传|更换|移除|裁剪/ })).toHaveText(['裁剪', '上传图片']);

    await page.getByTestId('cover-input').setInputFiles(PNG);
    await expect(wx.getByTestId('own-cover-weixin')).toHaveCount(0); // 通用封面不会写进公众号单独封面
    await expect(page.getByTestId('cover-field').getByTestId('cover-focus')).toBeVisible();
    await expect(wx.getByAltText('公众号封面预览')).toBeVisible();
    await expect(wx).toContainText('使用通用封面 · 推荐 2.35:1（900×383）');

    // 单击缩略图可放大查看
    await wx.getByTestId('weixin-cover-preview').click();
    await expect(page.getByTestId('weixin-cover-zoom')).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).last().click();
    await expect(page.getByTestId('weixin-cover-zoom')).toHaveCount(0);

    // 复用通用封面并按 2.35:1 裁剪
    await wx.getByTestId('weixin-crop-open').click();
    await expect(page.getByTestId('weixin-cover-crop')).toBeVisible();
    await page.getByTestId('weixin-crop-stage').click({ position: { x: 20, y: 20 } });
    await page.getByTestId('weixin-crop-confirm').click();
    await expect(page.getByTestId('weixin-cover-crop')).toHaveCount(0);
    await expect(wx.getByTestId('own-cover-weixin')).toBeVisible();

    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weixin.coverImageUrl).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.weixinSquareCoverImagePath).toMatch(/assets\/up\.png$/);
    expect(calls.weixin.author).toBeUndefined();
    expect(calls.weixin.sourceUrl).toBeUndefined();
    expect(calls.zhihu.coverImageUrl).toMatch(/assets\/up\.png$/); // 同一张通用封面也给知乎
  });

  test('正文没有图片也没传封面：公众号块提示上传 2.35:1（900×383）且无裁剪按钮', async ({ page }) => {
    await openPublishWith(page, { ...base, md: '# 公众号文章：多平台发布流程\n\n正文。\n' });
    const wx = page.getByTestId('section-weixin');
    await expect(wx).toContainText('缺封面');
    await wx.getByRole('button', { expanded: false }).click();
    await expect(wx).toContainText('请上传一张封面（推荐 2.35:1，900×383）');
    await expect(wx.getByTestId('weixin-crop-open')).toHaveCount(0);
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：公众号块单行对齐（用通用封面）`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { ...base, theme, sampleImage: true });
      await page.getByTestId('cover-input').setInputFiles(PNG);
      const wx = page.getByTestId('section-weixin');
      await wx.getByRole('button', { expanded: false }).click();
      await expect(wx.getByAltText('公众号封面预览')).toBeVisible();
      await wx.scrollIntoViewIfNeeded();
      await shot(page, testInfo, `weixin-cover-${mode}`);
    });
  }
});
