import { expect, test } from '@playwright/test';
import { installMockWorkspace, openEditor } from './support/mockWorkspace';
import { caretAt, saveAndRead } from './support/integrity';

/**
 * 冒烟测试 @smoke —— 数据完整性：在 4 空格缩进代码块里编辑（TODO #13）。
 * 运行层级：L2 无头 Chromium + 内存 mock 工作区，真实 Vditor 编辑器与真实键盘输入。
 * 规则：缩进代码块必须保持缩进写法（不许改成 ``` 围栏），所有行都在，只多用户输入的字符，
 * 文件其余部分逐字节不变。
 */

const DOC = '# 标题\n\n段落一。\n\n    第一行代码\n    第二行代码\n    第三行代码\n\n结尾段落。\n';

test.describe('@smoke 数据完整性：缩进代码块内编辑', () => {
  test('块内第二行末尾输入 x：代码块所有行仍在、只多一个 x，其余逐字节不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': DOC } });
    await openEditor(page);
    await caretAt(page, '第二行代码');
    await page.keyboard.type('x');
    expect(await saveAndRead(page)).toBe(DOC.replace('    第二行代码\n', '    第二行代码x\n'));
  });

  test('CRLF 文件：缩进代码块内输入后仍是 CRLF，只多一个 x', async ({ page }) => {
    const crlf = DOC.replace(/\n/g, '\r\n');
    await installMockWorkspace(page, { files: { 'a.md': crlf } });
    await openEditor(page);
    await caretAt(page, '第二行代码');
    await page.keyboard.type('x');
    expect(await saveAndRead(page)).toBe(crlf.replace('    第二行代码\r\n', '    第二行代码x\r\n'));
  });

  test('连续两次保存：两次输入都只改代码块里那一行', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': DOC } });
    await openEditor(page);
    await caretAt(page, '第二行代码');
    await page.keyboard.type('x');
    const once = DOC.replace('    第二行代码\n', '    第二行代码x\n');
    expect(await saveAndRead(page)).toBe(once);
    await caretAt(page, '第三行代码');
    await page.keyboard.type('y');
    expect(await saveAndRead(page)).toBe(once.replace('    第三行代码\n', '    第三行代码y\n'));
  });
});
