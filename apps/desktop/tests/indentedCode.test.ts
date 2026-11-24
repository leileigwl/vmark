import assert from 'node:assert/strict';
import test from 'node:test';
import { fenceIndentedCode, unfenceIndentedCode } from '../src/renderer/src/features/workspace-tree/indentedCode.ts';
import { preserveUntouched } from '../src/renderer/src/features/workspace-tree/preserveSave.ts';

/**
 * 冒烟测试 @smoke（数据完整性，TODO #13 的单元层）：编辑器（Vditor/Lute）认不出 4 空格缩进代码块，
 * 打开时把它们临时换成编辑器能编辑的私有 ~~~~~ 围栏，保存时还原成缩进写法，磁盘上永远是缩进代码块。
 */

const DOC = '# 标题\n\n段落一。\n\n    第一行代码\n    第二行代码\n\n    第三行代码\n\n结尾段落。\n';

test('fenceIndentedCode：缩进代码块换成私有围栏，其余行不变', () => {
  const { text, fence } = fenceIndentedCode(DOC);
  assert.equal(fence, '~~~~~');
  assert.equal(text, '# 标题\n\n段落一。\n\n~~~~~\n第一行代码\n第二行代码\n\n第三行代码\n~~~~~\n\n结尾段落。\n');
});

test('unfenceIndentedCode：还原后与原文逐字节相同', () => {
  const { text, fence } = fenceIndentedCode(DOC);
  assert.ok(fence);
  assert.equal(unfenceIndentedCode(text, fence), DOC);
});

test('没有缩进代码块时原样返回、不选围栏', () => {
  const md = '# t\n\n- 列表\n\n    列表里的续行（不是代码）\n\n段落\n    懒惰续行（不是代码）\n';
  assert.deepEqual(fenceIndentedCode(md), { text: md, fence: null });
});

test('围栏代码块、front matter 里的缩进行不当成缩进代码块', () => {
  const md = '---\ntitle: a\n---\n\n```\n\n    围栏里的缩进\n```\n';
  assert.deepEqual(fenceIndentedCode(md), { text: md, fence: null });
});

test('私有围栏比文中任何 ~ 行都长，块内的 ~~~~~ 不会提前闭合', () => {
  const md = '段\n\n    ~~~~~~\n    代码\n';
  const { text, fence } = fenceIndentedCode(md);
  assert.equal(fence, '~~~~~~~');
  assert.equal(text, '段\n\n~~~~~~~\n~~~~~~\n代码\n~~~~~~~\n');
  assert.equal(unfenceIndentedCode(text, fence), md);
});

test('CRLF 文件也能识别；用户自己的 ``` 围栏不被改写', () => {
  const md = '段\r\n\r\n    代码\r\n';
  const { text, fence } = fenceIndentedCode(md);
  assert.equal(text, '段\n\n~~~~~\n代码\n~~~~~\n');
  assert.equal(unfenceIndentedCode('```\n代码\n```\n', '~~~~~'), '```\n代码\n```\n');
});

test('块内第二行末尾输入 x：经 preserveUntouched 后只多一个 x，代码块保持缩进', () => {
  const { text, fence } = fenceIndentedCode(DOC);
  assert.ok(fence);
  const edited = text.replace('第二行代码\n', '第二行代码x\n');
  const out = preserveUntouched(DOC, unfenceIndentedCode(text, fence), unfenceIndentedCode(edited, fence));
  assert.equal(out, DOC.replace('    第二行代码\n', '    第二行代码x\n'));
  assert.ok(!out.includes('~~~'));
});
