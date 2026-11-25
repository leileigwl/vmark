import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, shot } from './support/publishMock';

const NO_IMAGE = '# 多平台发布流程：封面比例各回各家\n\n只有文字。\n';
const setup = {
  md: NO_IMAGE,
  auth: { weixin: true, zhihu: true, baijiahao: true, weibo: true, xiaohongshu: true },
  selected: ['weixin', 'zhihu', 'baijiahao', 'weibo', 'xiaohongshu'],
  saved: { title: '多平台发布流程：封面比例各回各家', digest: '短摘要' },
};

test.describe('封面与缺项提示归位：通用缺项只在上方填写，「需要单独处理」仅留平台差异项', () => {
  test('通用区写明 16:9 与需封面平台；小红书块写 3:4；通用缺封面不在「需要单独处理」重复弹出', async ({ page }) => {
    await openPublishWith(page, setup);
    const general = page.getByTestId('general-section');
    for (const r of ['2.35:1', '1:1', '3:4']) await expect(general).not.toContainText(r);
    await expect(page.getByTestId('cover-hint')).toHaveText('推荐 16:9，公众号、百家号、微博需封面');

    await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
    await expect(page.getByTestId('section-social')).toContainText('封面 3:4');

    // 未上传封面时，不在下方「需要单独处理」重复弹出缺封面框；左侧行显示差 1 项
    await expect(page.getByTestId('attention-baijiahao')).toHaveCount(0);
    await expect(page.getByTestId('attention-weibo')).toHaveCount(0);
    await expect(page.getByTestId('attention-zhihu')).toHaveCount(0);
    await expect(page.getByTestId('platform-row-baijiahao')).toContainText('差 1 项');
    await expect(page.getByTestId('platform-row-weibo')).toContainText('差 1 项');

    await page.getByTestId('cover-input').setInputFiles({ name: 'c.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(page.getByTestId('platform-row-baijiahao')).toContainText('就绪');
    await expect(page.getByTestId('platform-row-weibo')).toContainText('就绪');

    // 只有通用标题过短触发平台差异时，百家号才出现在「需要单独处理」里，且不重复放上传封面按钮
    await page.locator('#pub-title').fill('短标题');
    await expect(page.getByTestId('attention-baijiahao')).toContainText('百家号：标题差 5 字');
    await page.getByTestId('attention-baijiahao').getByRole('button', { expanded: false }).click();
    await expect(page.locator('#t-baijiahao')).toBeVisible();
    await expect(page.getByTestId('cover-rule-baijiahao')).toHaveCount(0);
    await expect(page.getByTestId('cover-hint')).not.toContainText('16:9');
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：比例各回各家`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { ...setup, saved: { ...setup.saved, title: '超过微博三十二字上限的超长通用标题示例'.repeat(2) }, theme });
      await page.getByTestId('attention-weibo').getByRole('button', { expanded: false }).click();
      await expect(page.locator('#t-weibo')).toBeVisible();
      await page.getByTestId('attention-weibo').scrollIntoViewIfNeeded();
      await shot(page, testInfo, `cover-rows-${mode}`);
      await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
      await expect(page.getByTestId('section-social')).toContainText('封面 3:4');
      await page.getByTestId('section-social').getByText(/封面 3:4/).scrollIntoViewIfNeeded();
      await page.getByRole('dialog').locator('main').evaluate((m) => (m.scrollTop += 200));
      await shot(page, testInfo, `cover-social-${mode}`);
    });
  }
});
