import { expect, test, type Page } from '@playwright/test';
import { installMockWorkspace, openEditor, placeCaretAtEnd } from './support/mockWorkspace';

/**
 * A 层 QA（2026-11-26，推广前）：界面刷新——切文件后大纲/发布弹窗、编辑中的大纲、主题切换，不需要重启。
 * 运行层级：L2 无头 Chromium + 内存 mock 工作区。
 */
const A = '# 甲文章\n\n## 甲一\n\n正文甲。\n\n## 甲二\n\n更多甲。\n';
const B = '# 乙文章\n\n## 乙一\n\n正文乙。\n';

const openFile = (page: Page, rel: string) => page.getByRole('button', { name: rel, exact: true }).first().click();

async function outlineTexts(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: '大纲', exact: true }).first().click();
  const items = page.locator('aside, nav, [data-testid="sidebar"]').getByText(/^(甲|乙)/);
  await expect(items.first()).toBeVisible();
  return items.allInnerTexts();
}

test.describe('A 层：窗口内容随操作刷新', () => {
  test('切到另一篇文件：大纲换成新文件的标题，不残留旧文件', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    expect((await outlineTexts(page)).join('|')).toContain('甲二');
    await page.getByRole('button', { name: /^文件/ }).first().click();
    await openFile(page, 'b.md');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('正文乙');
    const after = (await outlineTexts(page)).join('|');
    expect(after).toContain('乙一');
    expect(after).not.toContain('甲二');
  });

  test('编辑中新增二级标题：大纲随之出现，无需切换文件或重启', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A } });
    await openEditor(page);
    await placeCaretAtEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('## 甲三新增');
    await page.waitForTimeout(800);
    await expect.poll(async () => (await outlineTexts(page)).join('|'), { timeout: 5000 }).toContain('甲三新增');
  });

  test('切到另一篇文件后打开发布：表单是新文件自己的（不带上一篇填的标题），上一篇的设置也不被覆盖', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A, 'b.md': B } });
    await openEditor(page);
    const title = () => page.getByRole('dialog').getByRole('textbox', { name: /^标题/ });
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await title().fill('甲的发布标题');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openFile(page, 'b.md');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('正文乙');
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await expect(title()).toHaveValue('');
    await title().fill('乙的发布标题');
    await page.keyboard.press('Escape');

    await openFile(page, 'a.md');
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('正文甲');
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await expect(title()).toHaveValue('甲的发布标题');
  });

  test('主题切换即时生效：html[data-theme] 与编辑区背景随之改变，无需重启', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': A } });
    await openEditor(page);
    const bg = () => page.locator('.vditor-ir .vditor-reset').evaluate((el) => getComputedStyle(el.closest('.vditor') ?? el).backgroundColor);
    const before = await bg();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'bloom-ink-dark'));
    await expect.poll(bg).not.toBe(before);
  });

  test('设置里关掉「自动匹配符号」回到编辑器立即生效（不需重启），再打开也立即恢复', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '第一段。\n' } });
    await openEditor(page);
    const toggle = async () => {
      await page.getByTitle('偏好设置 (图床 / 平台 / GitHub)').click();
      await page.getByRole('button', { name: '编辑与导出' }).click();
      await page.locator('label', { hasText: '自动匹配符号' }).getByRole('checkbox').click();
      await page.getByRole('button', { name: '← 返回写作台' }).click();
      await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible' });
    };
    const typeParen = async (mark: string) => {
      await placeCaretAtEnd(page);
      await page.keyboard.type(mark);
      await page.keyboard.type('(');
      await page.waitForTimeout(150);
      return page.locator('.vditor-ir .vditor-reset').innerText();
    };
    expect(await typeParen('甲')).toContain('甲()');
    await toggle();
    const off = await typeParen('乙');
    expect(off).toContain('乙(');
    expect(off).not.toContain('乙()');
    await toggle();
    expect(await typeParen('丙')).toContain('丙()');
  });
});
