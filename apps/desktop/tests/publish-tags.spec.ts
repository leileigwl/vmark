import { expect, test } from '@playwright/test';
import { THEMES, openPublishWith, publishedCalls, shot } from './support/publishMock';

const MD = '# 多平台发布流程\n\n正文。\n\n![配图](./assets/demo.png)\n';
const DIGEST = '这是一段写给掘金的摘要，长度刚好落在五十到一百字之间，所以这里多写几句话，说明这篇文章讲的是多平台发布流程的设计。';
const TAGS = ['前端', '工具', '效率', 'React', 'Electron'];
const setup = { md: MD, auth: { weixin: true, juejin: true, csdn: true }, selected: ['weixin', 'juejin', 'csdn'], saved: { digest: DIGEST, tags: TAGS, juejinCategoryId: '6809637767543259144' } };

test.describe('通用标签一份，平台行只列平台专属的那一点', () => {
  test('掘金：标签超上限只提示并默认取前 3 个；行里从通用标签里挑，其他平台仍用全部通用标签', async ({ page }) => {
    await openPublishWith(page, setup);
    const row = page.getByTestId('attention-juejin');
    await expect(row).toContainText('掘金：标签超 2 个（取前 3 个）');
    await expect(page.getByTestId('attention-csdn')).toHaveCount(0);
    await expect(page.getByTestId('publish-start')).toHaveText('推送到 3 个草稿箱');
    await row.getByRole('button', { expanded: false }).click();
    const picker = row.getByRole('group', { name: '掘金标签' });
    await expect(picker.getByRole('checkbox')).toHaveCount(5);
    for (const t of ['前端', '工具', '效率']) await expect(picker.getByRole('checkbox', { name: t })).toHaveAttribute('aria-checked', 'true');
    await expect(picker.getByRole('checkbox', { name: 'Electron' })).toBeDisabled(); // 已满 3 个
    await expect(row).toContainText('按名称匹配掘金标签');
    await expect(row.locator('#g-juejin')).toHaveCount(0); // 不再在行里放一份通用标签输入框
    await picker.getByRole('checkbox', { name: '工具' }).click();
    await picker.getByRole('checkbox', { name: 'Electron' }).click();
    await expect(row).toContainText('已就绪');
    await page.getByTestId('publish-start').click();
    await expect(page.getByTestId('publish-results').locator('[data-state="ok"]')).toHaveCount(3);
    const calls = await publishedCalls(page);
    expect(calls.juejin.tags).toEqual(['前端', '效率', 'Electron']);
    expect(calls.csdn.tags).toEqual(TAGS);
    expect(calls.weixin.tags).toEqual(TAGS);
  });

  for (const [mode, theme] of THEMES) {
    test(`截图（${mode}）：掘金行只列分类与标签上限`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await openPublishWith(page, { ...setup, saved: { ...setup.saved, juejinCategoryId: '' }, theme });
      const row = page.getByTestId('attention-juejin');
      await expect(row).toContainText('掘金：标签超 2 个（取前 3 个） · 缺分类');
      await row.getByRole('button', { expanded: false }).click();
      await expect(row.getByRole('group', { name: '掘金标签' })).toBeVisible();
      await row.scrollIntoViewIfNeeded();
      await shot(page, testInfo, `tags-juejin-${mode}`);
    });
  }
});
