import { expect, test } from '@playwright/test';
import { openPublishWith, publishedCalls } from './support/publishMock';

const MD = '# 掘金分类测试\n\n正文。\n';
const DIGEST = '这是一段写给掘金的摘要，长度刚好落在五十到一百字之间，所以这里多写几句话，说明这篇文章讲的是掘金分类运行时拉取。';

test.describe('TODO 2：掘金分类运行时拉取', () => {
  test('IPC 返回新分类时界面显示新分类并可提交选中项', async ({ page }) => {
    await openPublishWith(page, {
      md: MD,
      auth: { juejin: true },
      selected: ['juejin'],
      saved: { title: '掘金分类测试', digest: DIGEST, tags: ['前端'], juejinCategoryId: '' },
      juejinCategories: [
        { id: 'live-1', name: '云原生' },
        { id: 'live-2', name: 'AI 工程' },
      ],
    });

    const row = page.getByTestId('attention-juejin');
    await row.getByRole('button', { expanded: false }).click();

    const group = row.getByRole('radiogroup', { name: '掘金分类' });
    await expect(group.getByRole('radio', { name: '云原生' })).toBeVisible();
    await expect(group.getByRole('radio', { name: 'AI 工程' })).toBeVisible();
    await expect(group.getByRole('radio', { name: '前端' })).toHaveCount(0);

    await group.getByRole('radio', { name: '云原生' }).click();
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);

    const calls = await publishedCalls(page);
    expect(calls.juejin.juejinCategoryId).toBe('live-1');
  });

  test('IPC 失败时退回内置列表且不阻塞发布', async ({ page }) => {
    await openPublishWith(page, {
      md: MD,
      auth: { juejin: true },
      selected: ['juejin'],
      saved: { title: '掘金分类测试', digest: DIGEST, tags: ['前端'], juejinCategoryId: '' },
      juejinCategories: 'fail',
    });

    const row = page.getByTestId('attention-juejin');
    await row.getByRole('button', { expanded: false }).click();

    const group = row.getByRole('radiogroup', { name: '掘金分类' });
    await expect(group.getByRole('radio', { name: '前端' })).toBeVisible();
    await expect(group.getByRole('radio', { name: '后端' })).toBeVisible();

    await group.getByRole('radio', { name: '前端' }).click();
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(1);

    const calls = await publishedCalls(page);
    expect(calls.juejin.juejinCategoryId).toBe('6809637767543259144');
  });
});
