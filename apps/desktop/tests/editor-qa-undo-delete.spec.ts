import { expect, test, type Page } from '@playwright/test';
import { installMockWorkspace, openEditor, placeCaretAtEnd } from './support/mockWorkspace';
import { caretAt, saveAndRead, selectText } from './support/integrity';

/**
 * A 层 QA（2026-11-26，推广前）：写字 / 撤销重做 / 删除 / 光标。
 * 运行层级：L2 无头 Chromium + 内存 mock 工作区，真实 Vditor 与真实键盘事件。
 * 每条都看两件事：落盘内容（只多/少用户那一下）和撤销后光标落点。
 */

async function open(page: Page, files: Record<string, string>) {
  await installMockWorkspace(page, { files });
  await openEditor(page);
}

/** Vditor 按停顿切分撤销步：两次输入之间停一下，才是用户眼里的「两步」。 */
const pause = (page: Page) => page.waitForTimeout(900);

const undo = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(150);
};
const redo = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.waitForTimeout(150);
};

/** 光标前后各 n 个字（以编辑器纯文本计），用来断言撤销后光标落点。 */
async function caretContext(page: Page, n = 4): Promise<{ before: string; after: string; collapsed: boolean } | null> {
  return page.evaluate((k) => {
    const root = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(r.startContainer, r.startOffset);
    const post = document.createRange();
    post.selectNodeContents(root);
    post.setStart(r.endContainer, r.endOffset);
    const clean = (s: string) => s.replace(/[\u200b\u2060\n]/g, '');
    const b = clean(pre.toString());
    const a = clean(post.toString());
    return { before: b.slice(-k), after: a.slice(0, k), collapsed: r.collapsed };
  }, n);
}

/** 编辑器里能看到的文字（不含零宽字符）。 */
const visibleText = (page: Page) =>
  page.locator('.vditor-ir .vditor-reset').evaluate((el) => (el as HTMLElement).innerText.replace(/[\u200b\u2060]/g, ''));

test.describe('A 层：连续输入与多步撤销/重做', () => {
  test('中英文分三段输入，撤销两次回到第一段、重做一次回到两段，光标在末尾', async ({ page }) => {
    const DOC = '# 标题\n\n第一段。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第一段。');
    await page.keyboard.type('Hello');
    await pause(page);
    await page.keyboard.type('世界');
    await pause(page);
    await page.keyboard.type(' vmark');
    await pause(page);

    await undo(page);
    expect(await caretContext(page)).toMatchObject({ before: 'lo世界', collapsed: true });
    await undo(page);
    expect(await caretContext(page)).toMatchObject({ before: 'ello', collapsed: true });
    await redo(page);
    expect(await caretContext(page)).toMatchObject({ before: 'lo世界', collapsed: true });
    expect(await saveAndRead(page)).toBe('# 标题\n\n第一段。Hello世界\n');
  });

  test('撤销到底不会越过文件初始内容（不清空、不变成别的文件）', async ({ page }) => {
    const DOC = '第一段。\n\n第二段。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第二段。');
    await page.keyboard.type('追加');
    await pause(page);
    for (let i = 0; i < 6; i++) await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect(await visibleText(page)).toContain('第二段。');
  });
});

test.describe('A 层：删除与撤销删除后的光标', () => {
  test('段首 Backspace 合并到上一段；撤销后恢复两段，光标回到第二段段首', async ({ page }) => {
    const DOC = '第一段文字。\n\n第二段文字。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第二段', true);
    await page.keyboard.press('Backspace');
    expect(await saveAndRead(page)).toBe('第一段文字。第二段文字。\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect(await caretContext(page)).toMatchObject({ after: '第二段文', collapsed: true });
  });

  test('段尾 Delete 合并下一段；撤销后恢复，光标回到第一段段尾', async ({ page }) => {
    const DOC = '第一段文字。\n\n第二段文字。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第一段文字。');
    await page.keyboard.press('Delete');
    expect(await saveAndRead(page)).toBe('第一段文字。第二段文字。\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect(await caretContext(page)).toMatchObject({ before: '段文字。', collapsed: true });
  });

  test('连续 Backspace 删 5 个字，撤销恢复全部，且光标在恢复文字之后', async ({ page }) => {
    const DOC = '前文。\n\n删除测试一二三四五。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '一二三四五');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    expect(await saveAndRead(page)).toBe('前文。\n\n删除测试。\n');
    for (let i = 0; i < 5; i++) {
      await undo(page);
      if ((await visibleText(page)).includes('一二三四五')) break;
    }
    expect(await saveAndRead(page)).toBe(DOC);
    expect(await caretContext(page)).toMatchObject({ before: '二三四五', collapsed: true });
  });

  test('跨段选区删除后撤销：内容逐字节还原', async ({ page }) => {
    const DOC = '甲段落第一句。\n\n乙段落第二句。\n\n丙段落第三句。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '甲段落');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Backspace');
    const cut = await saveAndRead(page);
    expect(cut).not.toBe(DOC);
    expect(cut).toContain('甲段落');
    expect(cut).toContain('丙段落第三句。');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('选中一段文字按 Delete，再撤销：选区文字回来，前后文不变', async ({ page }) => {
    const DOC = '这是一段需要部分删除的文字。\n';
    await open(page, { 'a.md': DOC });
    await selectText(page, '需要部分');
    await page.keyboard.press('Delete');
    expect(await saveAndRead(page)).toBe('这是一段删除的文字。\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('列表第二项行首 Backspace 不吞掉第一项；撤销恢复两项', async ({ page }) => {
    const DOC = '- 第一项\n- 第二项\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第二项', true);
    await page.keyboard.press('Backspace');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).toContain('第一项');
    expect(after).toContain('第二项');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('引用块后面一段段首 Backspace：引用内容不丢；撤销恢复', async ({ page }) => {
    const DOC = '> 引用里的话。\n\n引用后面的段落。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '引用后面', true);
    await page.keyboard.press('Backspace');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).toContain('引用里的话。');
    expect(after).toContain('引用后面的段落。');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('代码块后面一段段首 Backspace：代码块不被拉开或吞掉；撤销恢复', async ({ page }) => {
    const DOC = '```js\nconst a = 1;\n```\n\n代码后面的段落。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '代码后面', true);
    await page.keyboard.press('Backspace');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).toContain('const a = 1;');
    expect(after).toContain('代码后面的段落。');
    expect((after.match(/```/g) ?? []).length % 2).toBe(0);
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('公式块后面一段段首 Backspace：$$ 公式不被破坏；撤销恢复', async ({ page }) => {
    const DOC = '$$\nE = mc^2\n$$\n\n公式后面的段落。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '公式后面', true);
    await page.keyboard.press('Backspace');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).toContain('E = mc^2');
    expect(after).toContain('公式后面的段落。');
    expect((after.match(/\$\$/g) ?? []).length % 2).toBe(0);
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });
});

test.describe('A 层：#120 缩进代码块临时 ~~~~ 围栏不外露', () => {
  const DOC = '# 标题\n\n段落一。\n\n    第一行代码\n    第二行代码\n\n结尾段落。\n';

  test('块内输入后撤销：落盘回到原文，编辑器与磁盘都不出现 ~~~~', async ({ page }) => {
    await open(page, { 'a.md': DOC });
    expect(await visibleText(page)).not.toContain('~~~');
    await caretAt(page, '第二行代码');
    await page.keyboard.type('xyz');
    await pause(page);
    expect(await saveAndRead(page)).toBe(DOC.replace('    第二行代码\n', '    第二行代码xyz\n'));
    await undo(page);
    expect(await visibleText(page)).not.toContain('~~~');
    const back = await saveAndRead(page);
    expect(back).toBe(DOC);
  });

  test('撤销到底也不把临时围栏撤出来（围栏不在撤销栈里）', async ({ page }) => {
    await open(page, { 'a.md': DOC });
    await caretAt(page, '段落一。');
    await page.keyboard.type('改');
    await pause(page);
    for (let i = 0; i < 5; i++) await undo(page);
    expect(await visibleText(page)).not.toContain('~~~');
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('代码块后一段段首 Backspace 再撤销：磁盘不出现 ~~~~，缩进代码仍是缩进写法', async ({ page }) => {
    await open(page, { 'a.md': DOC });
    await caretAt(page, '结尾段落', true);
    await page.keyboard.press('Backspace');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).not.toMatch(/~~~/);
    expect(after).toContain('第一行代码');
    await undo(page);
    expect(await visibleText(page)).not.toContain('~~~');
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('代码块内整行删除（Shift+Home 选中后删除）：不露出 ~~~~，其余逐字节不变', async ({ page }) => {
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第二行代码');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    expect(await visibleText(page)).not.toContain('~~~');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).not.toMatch(/~~~/);
    expect(after).toContain('    第一行代码\n');
    expect(after).toContain('结尾段落。');
  });
});

test.describe('A 层：#118 Shift+Tab 与撤销', () => {
  test('二级列表里输入后 Shift+Tab 再撤销：恢复为二级，内容还原，光标回到输入处', async ({ page }) => {
    const DOC = '- 一级\n  - 二级项\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '二级');
    await page.keyboard.type('甲');
    await pause(page);
    await page.keyboard.press('Shift+Tab');
    const out = (await saveAndRead(page)) ?? '';
    expect(out).toMatch(/^- 二级甲项$/m);
    await undo(page);
    expect(await saveAndRead(page)).toBe('- 一级\n  - 二级甲项\n');
    expect((await caretContext(page))?.before).toMatch(/二级甲$/);
  });
});

test.describe('A 层：打开文件后第一下就是 Tab / Shift+Tab', () => {
  test('第一下 Shift+Tab 再撤销：光标回到原字符处，而不是列表项开头', async ({ page }) => {
    const DOC = '- 一级\n  - 二级项\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '二级');
    await page.keyboard.press('Shift+Tab');
    expect(await saveAndRead(page)).toBe('- 一级\n- 二级项\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect(await caretContext(page)).toMatchObject({ before: '一级二级', after: '项', collapsed: true });
  });

  test('第一下 Tab 缩进再撤销：光标回到原字符处', async ({ page }) => {
    const DOC = '- 一级\n- 二级项\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '二级');
    await page.keyboard.press('Tab');
    expect(await saveAndRead(page)).toBe('- 一级\n  - 二级项\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect(await caretContext(page)).toMatchObject({ before: '一级二级', after: '项', collapsed: true });
  });
});

test.describe('A 层：#121 切换文件与撤销栈', () => {
  test('A 里输入后切到 B，在 B 按撤销不会把 A 的内容撤进 B，A 的输入已落盘', async ({ page }) => {
    await open(page, { 'a.md': 'A 文件原文。\n', 'b.md': 'B 文件原文。\n' });
    await caretAt(page, 'A 文件原文。');
    await page.keyboard.type('新增');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'b.md', exact: true }).first().click();
    await expect(page.locator('.vditor-ir .vditor-reset')).toContainText('B 文件原文。');
    await placeCaretAtEnd(page);
    for (let i = 0; i < 3; i++) await undo(page);
    expect(await visibleText(page)).not.toContain('A 文件');
    expect(await saveAndRead(page, 'b.md')).toBe('B 文件原文。\n');
    const a = await page.evaluate(() => (window as unknown as { __vcatFiles: Record<string, string> }).__vcatFiles['a.md']);
    expect(a).toBe('A 文件原文。新增\n');
  });
});

test.describe('A 层：更多删除/撤销组合', () => {
  test('全选删除整篇再撤销：整篇逐字节回来', async ({ page }) => {
    const DOC = '# 标题\n\n正文**加粗**与`代码`。\n\n- 列表一\n- 列表二\n\n> 引用\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '正文');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await visibleText(page)).not.toContain('正文');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('加粗后面紧邻处 Backspace 删 2 个字再撤销：** 成对、文字还原', async ({ page }) => {
    const DOC = '前面**加粗词**后面的字。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '后面的');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    const cut = (await saveAndRead(page)) ?? '';
    expect((cut.match(/\*\*/g) ?? []).length % 2).toBe(0);
    for (let i = 0; i < 3 && !(await visibleText(page)).includes('后面的字'); i++) await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('标题行首 Backspace 不把标题吞进上一段的文字丢失；撤销恢复', async ({ page }) => {
    const DOC = '上一段。\n\n## 小标题\n\n正文。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '小标题', true);
    await page.keyboard.press('Backspace');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).toContain('上一段。');
    expect(after).toContain('小标题');
    for (let i = 0; i < 3 && (await saveAndRead(page)) !== DOC; i++) await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('回车拆段后撤销：回到一段，光标在拆分点', async ({ page }) => {
    const DOC = '前半句后半句。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '前半句');
    await page.keyboard.press('Enter');
    expect(await saveAndRead(page)).toBe('前半句\n\n后半句。\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect((await caretContext(page))?.before).toMatch(/前半句$/);
  });

  test('列表项末尾 Delete 合并下一项，撤销恢复两项', async ({ page }) => {
    const DOC = '- 第一项\n- 第二项\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, '第一项');
    await page.keyboard.press('Delete');
    const after = (await saveAndRead(page)) ?? '';
    expect(after).toContain('第一项');
    expect(after).toContain('第二项');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('删除后继续输入，再撤销两次：先撤输入、再撤删除，不跳步', async ({ page }) => {
    const DOC = '原文ABC结尾。\n';
    await open(page, { 'a.md': DOC });
    await caretAt(page, 'ABC');
    await page.keyboard.press('Backspace');
    await pause(page);
    await page.keyboard.type('xy');
    await pause(page);
    expect(await saveAndRead(page)).toBe('原文ABxy结尾。\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe('原文AB结尾。\n');
    await undo(page);
    expect(await saveAndRead(page)).toBe(DOC);
    expect((await caretContext(page))?.before).toMatch(/ABC$/);
  });
});
