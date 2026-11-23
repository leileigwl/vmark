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

/**
 * 已知失败（preview/latest 4b7aa55 实测）：⌘S 把编辑器规范化后的 Markdown 整篇写回，
 * 改写了用户没碰过的地方（缩进代码块甚至整段被删成空行）。修复见 stacked PR 分支
 * fix/integrity-preserve-save；修复合入后这里的 test.fail 必须改回 test，否则会因「意外通过」报错。
 */
const KNOWN_FAIL_UNTOUCHED = new Set([
  '没有结尾换行',
  '结尾两个换行',
  '表格（--- 分隔行）',
  '紧凑表格',
  '对齐表格',
  'Front Matter 后的空行',
  'CRLF 换行',
  '中文 + emoji 混排（不许自动加空格）',
  'Setext 标题',
  '行尾两个空格硬换行',
  '多个连续空行',
  '*** 分割线',
  '缩进代码块',
]);

test.describe('@smoke 数据完整性 A1：打开后直接保存，文件逐字节不变', () => {
  for (const [name, content] of Object.entries(UNTOUCHED)) {
    const run = KNOWN_FAIL_UNTOUCHED.has(name) ? test.fail : test;
    run(`${name}`, async ({ page }) => {
      await installMockWorkspace(page, { files: { 'a.md': content } });
      await openEditor(page);
      expect(await saveAndRead(page)).toBe(content);
    });
  }
});

const MIXED = '# 标题\n\n第一段文字。\n\n- [ ] 任务\n- 列表项\n\n```js\nconst a = 1;\n```\n\n> 引用\n';

// 已知失败（同上，修复见 fix/integrity-preserve-save）：任务项后紧跟普通列表项时，任何一次编辑都会在两者之间多插一个空行。
test.describe('@smoke 数据完整性 A2：编辑后保存，只多出用户输入的内容', () => {
  test.fail('段落中间输入英文，其余逐字节不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '第一段');
    await page.keyboard.type('ABC');
    expect(await saveAndRead(page)).toBe(MIXED.replace('第一段文字。', '第一段ABC文字。'));
    await shot(page, 'A2-type-middle');
  });

  test.fail('列表项末尾输入中文与 emoji，不丢前一个字、不多空格', async ({ page }) => {
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

  test.fail('代码块里输入，代码块外的内容与围栏不变', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, 'const a = 1;');
    await page.keyboard.type(' // 注释');
    expect(await saveAndRead(page)).toBe(MIXED.replace('const a = 1;', 'const a = 1; // 注释'));
  });

  test.fail('Backspace 删除一个字，只少这一个字', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '第一段文字');
    await page.keyboard.press('Backspace');
    expect(await saveAndRead(page)).toBe(MIXED.replace('第一段文字。', '第一段文。'));
  });

  test.fail('自动保存（不按 ⌘S）写下的内容同样精确', async ({ page }) => {
    await installMockWorkspace(page, { files: { 'a.md': MIXED } });
    await openEditor(page);
    await caretAt(page, '引用');
    await page.keyboard.type('续');
    await expect.poll(async () => (await getCalls(page, 'saveArticle')).length, { timeout: 5000 }).toBeGreaterThan(0);
    const calls = await getCalls(page, 'saveArticle');
    expect(calls[calls.length - 1].args[1]).toBe(MIXED.replace('> 引用\n', '> 引用续\n'));
  });
});
