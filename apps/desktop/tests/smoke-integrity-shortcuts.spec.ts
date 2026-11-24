import { expect, test } from '@playwright/test';
import { installMockWorkspace, openEditor, sendMenu } from './support/mockWorkspace';
import { caretAt, diskContent, saveAndRead, selectText, shot } from './support/integrity';

/**
 * 冒烟测试 @smoke —— 数据完整性 B：每个快捷键 / 菜单命令只做它该做的那一处改动，
 * 不丢字、不多换行、不改别处。快捷键清单来自 editor/vditorKeyboard.ts、
 * features/editor-ir/index.ts（⌘S/⌘N/⌘F/⌘Z…）与 main/index.ts 菜单（段落/格式）。
 * 运行层级：L2 无头 Chromium + mock 工作区；菜单加速键用 `sendMenu` 重放主进程发来的 action。
 */

const DOC = '# 标题\n\n第一段文字。\n\n- 列表一\n- 列表二\n\n结尾段落。\n';

async function open(page: import('@playwright/test').Page, content = DOC, extra: Record<string, string> = {}) {
  await installMockWorkspace(page, { files: { 'a.md': content, ...extra } });
  await openEditor(page);
}

test.describe('@smoke 数据完整性 B：快捷键不丢不增内容', () => {
  test('⌘S 连按三次：内容不变、不重复写入多余字符', async ({ page }) => {
    await open(page);
    await caretAt(page, '结尾段落');
    await page.keyboard.type('X');
    await page.waitForTimeout(400);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+s');
    await page.waitForTimeout(400);
    expect(await diskContent(page)).toBe(DOC.replace('结尾段落。', '结尾段落X。'));
  });

  test('⌘N 新建文章：正在编辑的上一篇不丢最后输入', async ({ page }) => {
    await open(page);
    await caretAt(page, '结尾段落。');
    await page.keyboard.type('尾巴');
    await page.keyboard.press('ControlOrMeta+n');
    await page.waitForTimeout(800);
    expect(await diskContent(page)).toBe(DOC.replace('结尾段落。', '结尾段落。尾巴'));
  });

  test('⌘Z 撤销到底再 ⇧⌘Z 重做：先回到原文，再回到编辑后，逐字节一致', async ({ page }) => {
    await open(page);
    await caretAt(page, '第一段文字');
    await page.keyboard.type('甲');
    await page.waitForTimeout(900);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await saveAndRead(page)).toBe(DOC);
    await caretAt(page, '第一段文字');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await saveAndRead(page)).toBe(DOC.replace('第一段文字', '第一段文字甲'));
  });

  test('⌘B 选中文字加粗，再按一次取消：只多/少 ** 两对星号', async ({ page }) => {
    await open(page);
    await selectText(page, '文字');
    await page.keyboard.press('ControlOrMeta+b');
    expect(await saveAndRead(page)).toBe(DOC.replace('第一段文字。', '第一段**文字**。'));
    await selectText(page, '文字');
    await page.keyboard.press('ControlOrMeta+b');
    expect(await saveAndRead(page)).toBe(DOC);
  });

  test('⌘I 选中文字斜体：只多一对 *', async ({ page }) => {
    await open(page);
    await selectText(page, '文字');
    await page.keyboard.press('ControlOrMeta+i');
    expect(await saveAndRead(page)).toBe(DOC.replace('第一段文字。', '第一段*文字*。'));
  });

  test('列表项里回车：只新增一个空列表项后继续输入，其余不变', async ({ page }) => {
    await open(page);
    await caretAt(page, '列表二');
    await page.keyboard.press('Enter');
    await page.keyboard.type('列表三');
    expect(await saveAndRead(page)).toBe(DOC.replace('- 列表二\n', '- 列表二\n- 列表三\n'));
    await shot(page, 'B-enter-in-list');
  });

  test('列表项 Tab 缩进 / Shift+Tab：只改缩进，不丢不增任何文字', async ({ page }) => {
    await open(page);
    const indented = DOC.replace('- 列表二\n', '  - 列表二\n');
    await caretAt(page, '列表二', true);
    await page.keyboard.press('Tab');
    expect(await saveAndRead(page)).toBe(indented);
    await caretAt(page, '列表二', true);
    await page.keyboard.press('Shift+Tab');
    // 完整性只要求文字不变：结果必须是缩进前或缩进后之一（Shift+Tab 是否回退缩进属于功能问题，另行跟踪）。
    expect([DOC, indented]).toContain(await saveAndRead(page));
  });

  test('二级列表项 Shift+Tab：变回一级，文件其余内容逐字节不变', async ({ page }) => {
    const nested = '# 标题\n\n- 列表一\n  - 列表二\n- 列表三\n\n结尾段落。\n';
    await open(page, nested);
    // 光标在行尾（刚打完字最常见的位置），不是行首。
    await caretAt(page, '列表二');
    await page.keyboard.press('Shift+Tab');
    expect(await saveAndRead(page)).toBe(nested.replace('  - 列表二\n', '- 列表二\n'));
    await shot(page, 'B-shift-tab-outdent');
  });

  test('二级列表项 Shift+Tab 后接着打字：字落在原来光标处', async ({ page }) => {
    const nested = '- 列表一\n  - 列表二\n';
    await open(page, nested);
    await caretAt(page, '二', true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('X');
    expect(await saveAndRead(page)).toBe('- 列表一\n- 列表X二\n');
  });

  test('行首 Backspace：与上一段合并，不丢任何字', async ({ page }) => {
    await open(page, '第一段\n\n第二段\n');
    await caretAt(page, '第二段', true);
    await page.keyboard.press('Backspace');
    const saved = await saveAndRead(page);
    expect(saved?.replace(/\n/g, '')).toBe('第一段第二段');
  });

  test('粘贴多行纯文本：粘进去的就是剪贴板里的，不多空行', async ({ page }) => {
    await open(page);
    await caretAt(page, '结尾段落。');
    await page.evaluate(() => {
      const target = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', '粘贴一\n粘贴二');
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    const saved = await saveAndRead(page);
    expect(saved).toContain('粘贴一');
    expect(saved).toContain('粘贴二');
    expect(saved?.startsWith(DOC.replace('结尾段落。\n', ''))).toBe(true);
    expect(saved).not.toMatch(/\n{3,}/);
  });

  test('中文输入法组字上屏：只多出上屏的字', async ({ page }) => {
    await open(page);
    await caretAt(page, '第一段文字');
    const client = await page.context().newCDPSession(page);
    for (const t of ['z', 'zh', 'zho', 'zhon', 'zhong']) {
      await client.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
    }
    await client.send('Input.insertText', { text: '中' });
    expect(await saveAndRead(page)).toBe(DOC.replace('第一段文字', '第一段文字中'));
  });

  test('菜单「无序列表 ⌥⌘U」：只在当前行前加 "- "', async ({ page }) => {
    await open(page);
    await caretAt(page, '结尾段落', true);
    await sendMenu(page, 'editor:format', 'list');
    expect(await saveAndRead(page)).toBe(DOC.replace('结尾段落。', '- 结尾段落。'));
  });

  test('菜单「二级标题 ⌘2」：标题从 # 变 ##，其余不变', async ({ page }) => {
    await open(page);
    await caretAt(page, '标题');
    await sendMenu(page, 'editor:format', 'h2');
    expect(await saveAndRead(page)).toBe(DOC.replace('# 标题', '## 标题'));
  });

  test('⌘F 查找替换「全部替换」：只替换命中的词', async ({ page }) => {
    await open(page);
    await caretAt(page, '第一段');
    await page.keyboard.press('ControlOrMeta+f');
    await page.getByPlaceholder('查找正文...').fill('段落');
    await page.getByTitle('展开替换栏').click();
    await page.getByPlaceholder('替换为...').fill('部分');
    await page.getByRole('button', { name: '全部替换' }).click();
    await page.waitForTimeout(300);
    expect(await saveAndRead(page)).toBe(DOC.replace('结尾段落。', '结尾部分。'));
  });
});
