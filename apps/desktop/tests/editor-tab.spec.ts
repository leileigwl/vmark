import { expect, test } from '@playwright/test';
import { installMockWorkspace, openEditor } from './support/mockWorkspace';
import { caretAt, saveAndRead } from './support/integrity';

async function open(page: import('@playwright/test').Page, content: string) {
  await installMockWorkspace(page, { files: { 'a.md': content } });
  await openEditor(page);
}

test.describe('编辑器 Tab / Shift+Tab 行为：段落、表格、列表统一规范', () => {
  test('普通正文段落：Tab 插入 2 个空格（不插制表符），Shift+Tab 无效果且焦点留在编辑器内', async ({ page }) => {
    const doc = '# 标题\n\n第一段文字。\n';
    await open(page, doc);
    await caretAt(page, '第一段', false);
    await page.keyboard.press('Tab');
    await page.keyboard.type('X');
    const afterTab = await saveAndRead(page);
    expect(afterTab).toBe('# 标题\n\n第一段  X文字。\n');
    expect(afterTab).not.toContain('\t');

    // Shift+Tab 在普通段落里无效果且焦点仍在编辑器内
    await page.keyboard.press('Shift+Tab');
    const isFocusedInEditor = await page.evaluate(() => {
      const editor = document.querySelector('.vditor-ir .vditor-reset');
      return Boolean(editor && editor.contains(document.activeElement));
    });
    expect(isFocusedInEditor).toBe(true);
    expect(await saveAndRead(page)).toBe(afterTab);
  });

  test('表格单元格：Tab 跳至下一格、Shift+Tab 跳回上一格，首尾边界停在原地不新增行', async ({ page }) => {
    const doc = '| 列一 | 列二 |\n| --- | --- |\n| A1 | A2 |\n';
    await open(page, doc);

    // 从表头第 1 格出发：第 1 格 -> Tab -> 第 2 格 -> Tab -> A1 -> Tab -> A2
    await caretAt(page, '列一');
    await page.keyboard.press('Tab');
    await page.keyboard.type('x');
    await page.keyboard.press('Tab');
    await page.keyboard.type('y');
    await page.keyboard.press('Tab');
    await page.keyboard.type('z');

    // 最后一格再按 Tab：不新增行，仍留在最后一格
    await page.keyboard.press('Tab');
    await page.keyboard.type('!');

    // Shift+Tab 退回上一格（A1）
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('w');

    // 退回到第一格再按 Shift+Tab：焦点仍在编辑器内
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('h');

    const saved = await saveAndRead(page);
    expect(saved).toContain('列一h');
    expect(saved).toContain('列二x');
    expect(saved).toContain('A1yw');
    expect(saved).toContain('A2z!');
    const rowCount = await page.locator('.vditor-ir table tr').count();
    expect(rowCount).toBe(2);
  });

  test('列表项：行尾 Tab 缩进为子列表，第一项 Tab 与一级列表 Shift+Tab 均不插入制表符', async ({ page }) => {
    const doc = '- 列表一\n- 列表二\n';
    await open(page, doc);

    // 第一项按 Tab 不应插 \t
    await caretAt(page, '列表一');
    await page.keyboard.press('Tab');
    expect(await saveAndRead(page)).toBe(doc);

    // 第二项行尾按 Tab 缩进为二级列表并可继续打字
    await caretAt(page, '列表二');
    await page.keyboard.press('Tab');
    await page.keyboard.type('!');
    expect(await saveAndRead(page)).toBe('- 列表一\n  - 列表二!\n');

    // 反缩进回一级后再按 Shift+Tab 保持一级不变
    await page.keyboard.press('Shift+Tab');
    expect(await saveAndRead(page)).toBe('- 列表一\n- 列表二!\n');
    await page.keyboard.press('Shift+Tab');
    expect(await saveAndRead(page)).toBe('- 列表一\n- 列表二!\n');
  });
});
