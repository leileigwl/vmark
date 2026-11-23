import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const MD = '# 多平台发布流程\n\n正文。\n\n![配图](./assets/demo.png)\n';
const DIGEST = '这是一段写给所有平台共用的摘要，'.repeat(5); // 80 字，超过微博 44 字

test.describe('通用摘要一份：超出平台上限只提示，默认自动截取', () => {
  test('微博：「需要单独处理」标出摘要超 N 字，不挡推送；默认推送截取后的摘要', async ({ page }) => {
    await openPublishWith(page, { md: MD, auth: { weixin: true, weibo: true }, selected: ['weixin', 'weibo'], saved: { digest: DIGEST } });
    const row = page.getByTestId('attention-weibo');
    await expect(row).toContainText('微博：摘要超 36 字（自动截取）');
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 2 个草稿箱');
    await row.getByRole('button', { expanded: false }).click();
    await expect(page.locator('#d-weibo')).toHaveValue([...DIGEST].slice(0, 43).join('') + '…');
    await expect(row).toContainText('已自动截取到 44 字，可在这里改写');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect([...(calls.weibo.digest ?? '')].length).toBe(44);
    expect(calls.weixin.digest).toBe(DIGEST);
  });

  test('在微博行里单独改写摘要后按改写的推送，其他平台仍用通用摘要', async ({ page }) => {
    await openPublishWith(page, { md: MD, auth: { weixin: true, weibo: true }, selected: ['weixin', 'weibo'], saved: { digest: DIGEST } });
    const row = page.getByTestId('attention-weibo');
    await row.getByRole('button', { expanded: false }).click();
    await page.locator('#d-weibo').fill('微博专用的短摘要');
    await expect(row).toContainText('已就绪');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(2);
    const calls = await publishedCalls(page);
    expect(calls.weibo.digest).toBe('微博专用的短摘要');
    expect(calls.weixin.digest).toBe(DIGEST);
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：摘要超长提示与自动截取`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { md: MD, auth: { weixin: true, weibo: true, juejin: true }, selected: ['weixin', 'weibo', 'juejin'], saved: { digest: DIGEST, tags: ['前端'], juejinCategoryId: '6809637767543259144' }, theme });
      await expect(page.getByTestId('attention-juejin')).toHaveCount(0); // 80 字在掘金 50–100 字之内
      await page.getByTestId('attention-weibo').getByRole('button', { expanded: false }).click();
      await expect(page.locator('#d-weibo')).toBeVisible();
      await expect(page.locator('#d-weibo')).not.toHaveAttribute('aria-invalid', 'true'); // 只是提示，不标红
      await page.getByTestId('attention-weibo').scrollIntoViewIfNeeded();
      await shot(page, testInfo, `digest-truncate-${mode}`);
    });
  }
});
