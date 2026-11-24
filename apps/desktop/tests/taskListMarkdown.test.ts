import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTaskListMarkdown } from '../src/renderer/src/editor/vditorTaskList.ts';

test('任务项标记还原为 GFM 小写 x 单空格', () => {
  assert.equal(normalizeTaskListMarkdown('- [X]  任务一\n- [ ]  任务二\n'), '- [x] 任务一\n- [ ] 任务二\n');
  assert.equal(normalizeTaskListMarkdown('1. [X]  a\n  * [ ]  b\n> + [X]  c\n'), '1. [x] a\n  * [ ] b\n> + [x] c\n');
});

test('已规范的内容与非任务行保持不变', () => {
  const md = '- [x] 任务一\n- [ ] 任务二\n[X]  不是列表\n- 普通  两个空格\n';
  assert.equal(normalizeTaskListMarkdown(md), md);
});

test('代码块里的内容不改写', () => {
  const md = '```md\n- [X]  原样\n```\n~~~\n- [ ]  原样\n~~~\n- [X]  改\n';
  assert.equal(normalizeTaskListMarkdown(md), '```md\n- [X]  原样\n```\n~~~\n- [ ]  原样\n~~~\n- [x] 改\n');
});
