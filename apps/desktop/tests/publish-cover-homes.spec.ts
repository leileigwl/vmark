import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, shot } from './support/publishMock';

const NO_IMAGE = '# 多平台发布流程：封面比例各回各家\n\n只有文字。\n';
const setup = {
  md: NO_IMAGE,
  auth: { weixin: true, zhihu: true, baijiahao: true, weibo: true, xiaohongshu: true },
  selected: ['weixin', 'zhihu', 'baijiahao', 'weibo', 'xiaohongshu'],
  saved: { digest: '短摘要' },
};

test.describe('封面比例归位：通用区只有一个通用封面，比例放在各平台自己的块/行里', () => {
  test('通用区不出现任何比例；小红书块写 3:4；百家号/微博行写 16:9 必需', async ({ page }) => {
    await openPublishWith(page, setup);
    const general = page.getByTestId('general-section');
    for (const r of ['16:9', '2.35:1', '1:1', '3:4']) await expect(general).not.toContainText(r);
    await expect(page.getByTestId('cover-hint')).toHaveText('不上传则各平台用默认封面');

    await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
    await expect(page.getByTestId('section-social')).toContainText('封面 3:4');

    await expect(page.getByTestId('attention-baijiahao')).toContainText('百家号：缺封面（16:9 必需）');
    await expect(page.getByTestId('attention-weibo')).toContainText('微博：缺封面（16:9 必需）');
    await expect(page.getByTestId('attention-zhihu')).toHaveCount(0);
    await page.getByTestId('attention-baijiahao').getByRole('button', { expanded: false }).click();
    await expect(page.getByTestId('cover-rule-baijiahao')).toHaveText('封面必需 16:9 · 正文没有图片，请上传一张');
    await page.getByTestId('attention-baijiahao').getByRole('button', { name: '上传封面' }).click();
    await page.getByTestId('cover-input').setInputFiles({ name: 'c.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(page.getByTestId('attention-baijiahao')).toHaveCount(0); // 补好封面后这一行收起
    await expect(page.getByTestId('attention-weibo')).toHaveCount(0); // 通用封面同时补上微博
    // 百家号再出别的问题时，行里仍写明 16:9 必需，并说明用的是通用封面
    await page.locator('#pub-title').fill('短标题');
    await page.getByTestId('attention-baijiahao').getByRole('button', { expanded: false }).click();
    await expect(page.getByTestId('cover-rule-baijiahao')).toHaveText('封面必需 16:9 · 用通用封面按焦点裁');
    await expect(page.getByTestId('cover-hint')).not.toContainText('16:9');
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：比例各回各家`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { ...setup, theme });
      await page.getByTestId('attention-weibo').getByRole('button', { expanded: false }).click();
      await expect(page.getByTestId('cover-rule-weibo')).toBeVisible();
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
