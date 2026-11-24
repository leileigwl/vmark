import { expect, test } from '@playwright/test';
import { getCalls, installMockWorkspace, openEditor } from './support/mockWorkspace';
import { caretAt, saveAndRead, shot } from './support/integrity';

/**
 * 冒烟测试 @smoke —— 数据完整性 A：打开 → (编辑) → 保存，磁盘上的字节必须精确等于预期。
 * 运行层级：L2 无头 Chromium + 内存 mock 工作区（tests/support/mockWorkspace.ts），
 * 真实 Vditor 编辑器与真实快捷键；不经过 Electron 主进程写盘（主进程写盘见 smoke-integrity-electron-*）。
 */

/** 打开后不做任何编辑直接 ⌘S：文件必须逐字节不变（Markdown 写法、空行、换行符一个都不许改）。 */
const UNTOUCHED: Record<string, string> = {
  '标题与段落': '# 标题\n\n正文一段。\n',
  '任务列表 - [ ] / - [x]': '- [ ] 任务一\n- [x] 任务二\n',
  '星号列表 *': '* 星号一\n* 星号二\n',
  '短横列表 -': '- 短横一\n- 短横二\n',
  '加号列表 +': '+ 加号一\n+ 加号二\n',
  '有序列表': '1. 一\n2. 二\n3. 三\n',
  '嵌套列表': '- 外层\n  - 内层\n    - 更内层\n',
  '围栏代码块（含连续空行）': '```js\nconst a = 1;\n\n\nconst b = 2;\n```\n',
  '波浪线围栏': '~~~\nraw\n~~~\n',
  'HTML 块': '<div align="center">\n  <img src="a.png" width="200">\n</div>\n\n正文\n',
  '公式块': '$$\nE = mc^2\n$$\n',
  '行内公式': '质能方程 $E=mc^2$ 很有名。\n',
  '下划线强调': '_斜体_ 和 __粗体__\n',
  '引用': '> 引用一\n> 引用二\n',
  '引用式链接': '[链接][1]\n\n[1]: https://example.com\n',
  '转义字符': '\\*不是斜体\\* 和 1\\. 不是列表\n',
  '脚注': '正文[^1]\n\n[^1]: 脚注\n',
  '超长单行（3000 字符）': `${'x'.repeat(3000)}\n`,
  '没有结尾换行': '没有结尾换行',
  '结尾两个换行': '结尾两个换行\n\n',
  '表格（--- 分隔行）': '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
  '紧凑表格': '|a|b|\n|-|-|\n|1|2|\n',
  '对齐表格': '| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n',
  'Front Matter 后的空行': '---\ntitle: 测试\ntags: [a, b]\n---\n\n# 正文\n',
  'CRLF 换行': '第一行\r\n第二行\r\n',
  '中文 + emoji 混排（不许自动加空格）': '中文😀混排 English 🎉 日本語、한국어。\n',
  'Setext 标题': '标题\n===\n',
  '行尾两个空格硬换行': '行一  \n行二\n',
  '多个连续空行': '段一\n\n\n\n段二\n',
  '*** 分割线': '段\n\n***\n\n段\n',
  '缩进代码块': '    缩进代码\n    第二行\n',
};

test.describe('@smoke 数据完整性 A1：打开后直接保存，文件逐字节不变', () => {
  for (const [name, content] of Object.entries(UNTOUCHED)) {
    test(`${name}`, async ({ page }) => {
      await installMockWorkspace(page, { files: { 'a.md': content } });
      await openEditor(page);
      expect(await saveAndRead(page)).toBe(content);
    });
  }
});

const MIXED = '# 标题\n\n第一段文字。\n\n- [ ] 任务\n- 列表项\n\n```js\nconst a = 1;\n```\n\n> 引用\n';

test.describe('@smoke 数据完整性 A2：编辑后保存，只多出用户输入的内容', () => {
  test('段落中间输入英文，其余逐字节不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '第一段');
    await page.keyboard.type('ABC');
    expect(await saveAndRead(page)).toBe(MIXED.replace('第一段文字。', '第一段ABC文字。'));
    await shot(page, 'A2-type-middle');
  });

  test('列表项末尾输入中文与 emoji，不丢前一个字、不多空格', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '列表项');
    await page.keyboard.type('中文😀');
    expect(await saveAndRead(page)).toBe(MIXED.replace('- 列表项\n', '- 列表项中文😀\n'));
  });

  test('快速连续输入 200 个字符，一个不丢', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '开头\n' } });
    await openEditor(page);
    await caretAt(page, '开头');
    const burst = 'abcdefghij'.repeat(20);
    await page.keyboard.type(burst, { delay: 0 });
    expect(await saveAndRead(page)).toBe(`开头${burst}\n`);
  });

  test('代码块里输入，代码块外的内容与围栏不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, 'const a = 1;');
    await page.keyboard.type(' // 注释');
    expect(await saveAndRead(page)).toBe(MIXED.replace('const a = 1;', 'const a = 1; // 注释'));
  });

  test('Backspace 删除一个字，只少这一个字', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '第一段文字');
    await page.keyboard.press('Backspace');
    expect(await saveAndRead(page)).toBe(MIXED.replace('第一段文字。', '第一段文。'));
  });

  test('含图标 emoji 的行里输入：不偷偷补 U+FE0F、不在图标后加空格', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': '⚠注意事项\n\n✔完成😀开心\n' } });
    await openEditor(page);
    await caretAt(page, '开心');
    await page.keyboard.type('啊');
    expect(await saveAndRead(page)).toBe('⚠注意事项\n\n✔完成😀开心啊\n');
  });

  test('自动保存（不按 ⌘S）写下的内容同样精确', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '引用');
    await page.keyboard.type('续');
    await expect.poll(async () => (await getCalls(page, 'saveArticle')).length, { timeout: 5000 }).toBeGreaterThan(0);
    const calls = await getCalls(page, 'saveArticle');
    expect(calls[calls.length - 1].args[1]).toBe(MIXED.replace('> 引用\n', '> 引用续\n'));
  });
});

/** 文中含有编辑器会「规范化」的写法：编辑别处时，这些写法必须原样保留，只有编辑的那一行变化。 */
const QUIRKY =
  '---\ntitle: 测试\n---\n\n# 标题\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n行一  \n行二\n\n***\n\n    缩进代码\n\n- [ ] 任务\n- 列表项\n\n结尾段落。\n';

test.describe('@smoke 数据完整性 A3：编辑一处，其余写法逐字节保留', () => {
  test('文末段落输入：表格分隔行、硬换行空格、*** 分割线、缩进代码块、front matter 空行全部不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': QUIRKY } });
    await openEditor(page);
    await caretAt(page, '结尾段落');
    await page.keyboard.type('新增');
    expect(await saveAndRead(page)).toBe(QUIRKY.replace('结尾段落。', '结尾段落新增。'));
    await shot(page, 'A3-quirky-edit');
  });

  test('CRLF 文件里编辑：换行符仍是 CRLF，只改这一行', async ({ page }) => {
    const crlf = '第一行\r\n\r\n第二行\r\n';
    await installMockWorkspace(page, { files: { 'a.md': crlf } });
    await openEditor(page);
    await caretAt(page, '第二行');
    await page.keyboard.type('改');
    expect(await saveAndRead(page)).toBe('第一行\r\n\r\n第二行改\r\n');
  });

  test('连续两次保存：第二次编辑也只改那一处', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': QUIRKY } });
    await openEditor(page);
    await caretAt(page, '结尾段落');
    await page.keyboard.type('一');
    expect(await saveAndRead(page)).toBe(QUIRKY.replace('结尾段落。', '结尾段落一。'));
    await caretAt(page, '# 标题'.slice(2));
    await page.keyboard.type('二');
    expect(await saveAndRead(page)).toBe(QUIRKY.replace('结尾段落。', '结尾段落一。').replace('# 标题', '# 标题二'));
  });
});
