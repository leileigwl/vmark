import assert from 'node:assert/strict';
import test from 'node:test';
import { matchLines, preserveUntouched } from '../src/renderer/src/features/workspace-tree/preserveSave.ts';

/**
 * 冒烟测试 @smoke（数据完整性 A 的单元层）：保存只写用户改动的行。
 * original = 磁盘上的字节；baseline = 编辑器对 original 的规范化输出；current = 编辑后的输出。
 */
const CASES: Array<{ name: string; original: string; baseline: string; current: string; want: string }> = [
  {
    name: '没编辑：原样写回（含 CRLF）',
    original: '一\r\n二\r\n',
    baseline: '一\n二\n',
    current: '一\n二\n',
    want: '一\r\n二\r\n',
  },
  {
    name: '表格分隔行 | --- | 不被改写成 | - |',
    original: '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n正文\n',
    baseline: '| a | b |\n| - | - |\n| 1 | 2 |\n\n正文\n',
    current: '| a | b |\n| - | - |\n| 1 | 2 |\n\n正文改\n',
    want: '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n正文改\n',
  },
  {
    name: '改表格单元格：只换那一行，分隔行保留',
    original: '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
    baseline: '| a | b |\n| - | - |\n| 1 | 2 |\n',
    current: '| a | b |\n| - | - |\n| 1 | 3 |\n',
    want: '| a | b |\n| --- | --- |\n| 1 | 3 |\n',
  },
  {
    name: 'CRLF 文件里改一行、插一行：换行符保持 CRLF',
    original: '一\r\n二\r\n',
    baseline: '一\n二\n',
    current: '一改\n新\n二\n',
    want: '一改\r\n新\r\n二\r\n',
  },
  {
    name: '没有结尾换行：编辑后也不补换行',
    original: '没有',
    baseline: '没有\n',
    current: '没有改\n',
    want: '没有改',
  },
  {
    name: '任务项与普通项之间不多插空行',
    original: '- [ ] 任务\n- 列表项\n',
    baseline: '- [ ] 任务\n\n- 列表项\n',
    current: '- [ ] 任务\n\n- 列表项改\n',
    want: '- [ ] 任务\n- 列表项改\n',
  },
  {
    name: '编辑器丢掉的缩进代码块在别处编辑后仍保留',
    original: '段\n\n    代码\n',
    baseline: '段\n',
    current: '段改\n',
    want: '段改\n\n    代码\n',
  },
  {
    name: '硬换行的行尾两个空格保留',
    original: '行一  \n行二\n\n别处\n',
    baseline: '行一\n行二\n\n别处\n',
    current: '行一\n行二\n\n别处改\n',
    want: '行一  \n行二\n\n别处改\n',
  },
  {
    name: '文末追加段落：*** 分割线不变成 ---',
    original: '# t\n\n***\n',
    baseline: '# t\n\n---\n',
    current: '# t\n\n---\n\n新段\n',
    want: '# t\n\n***\n\n新段\n',
  },
  {
    name: '两处编辑夹着一个规范化块',
    original: 'a\n\n| x |\n| --- |\n\nb\n',
    baseline: 'a\n\n| x |\n| - |\n\nb\n',
    current: 'a1\n\n| x |\n| - |\n\nb1\n',
    want: 'a1\n\n| x |\n| --- |\n\nb1\n',
  },
  {
    name: '原文与编辑器输出一致时直接写编辑器内容',
    original: '# 标题\n',
    baseline: '# 标题\n',
    current: '# 标题改\n',
    want: '# 标题改\n',
  },
];

for (const c of CASES) {
  test(`preserveUntouched：${c.name}`, () => {
    assert.equal(preserveUntouched(c.original, c.baseline, c.current), c.want);
  });
}

test('preserveUntouched：删除整段与清空文档都如实写入', () => {
  assert.equal(preserveUntouched('a\n\nb  \n\nc\n', 'a\n\nb\n\nc\n', 'a\n\nc\n'), 'a\n\nc\n');
  assert.equal(preserveUntouched('| x |\n| --- |\n', '| x |\n| - |\n', ''), '');
});

test('matchLines：返回最长公共子序列的行号对', () => {
  assert.deepEqual(matchLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd']), [
    [0, 0],
    [2, 2],
    [3, 3],
  ]);
  assert.deepEqual(matchLines([], ['a']), []);
});
