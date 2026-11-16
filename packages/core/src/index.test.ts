import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildArticleMeta,
  countWords,
  extractOutline,
  scanWorkspaceArticles,
  transformTableMatrix,
} from './index.ts';

test('extractOutline skips fenced code blocks and extracts H1-H4', () => {
  const md = [
    '# 主标题',
    '```bash',
    '# 这是代码注释不是标题',
    '```',
    '## 二级标题',
    '### 三级标题',
  ].join('\n');

  const outline = extractOutline(md);
  assert.equal(outline.length, 3);
  assert.deepEqual(outline[0], { level: 1, text: '主标题', line: 1 });
  assert.deepEqual(outline[1], { level: 2, text: '二级标题', line: 5 });
});

test('countWords counts CJK characters and English words accurately', () => {
  assert.equal(countWords('你好世界 Hello World'), 6);
});

test('buildArticleMeta counts local assets images and ignores http images', () => {
  const md = `# 架构实战\n![local1](./assets/a.png)\n![remote](https://example.com/b.png)\n![local2](assets/c.jpg)`;
  const meta = buildArticleMeta(md, 'posts/arch.md', '/tmp/posts/arch.md', 1000);
  assert.equal(meta.title, '架构实战');
  assert.equal(meta.localImageCount, 2);
});

test('scanWorkspaceArticles finds markdown files and ignores assets/hidden dirs', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcat-core-'));
  try {
    await fs.mkdir(path.join(tmpDir, 'assets'));
    await fs.mkdir(path.join(tmpDir, '.git'));
    await fs.writeFile(path.join(tmpDir, 'assets', 'ignore.md'), '# ignore');
    await fs.writeFile(path.join(tmpDir, 'post.md'), '# 真实文章\n内容正文');

    const articles = await scanWorkspaceArticles(tmpDir);
    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, '真实文章');
    assert.equal(articles[0].relativePath, 'post.md');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('transformTableMatrix cleanly inserts and deletes rows/columns without breaking header', () => {
  const initial = [
    ['模式', '耗时'],
    ['route', '6.2s'],
    ['parallel', '3.4s'],
  ];
  const withCol = transformTableMatrix(initial, 'col-right', 1, 0);
  assert.deepEqual(withCol, [
    ['模式', '列', '耗时'],
    ['route', '', '6.2s'],
    ['parallel', '', '3.4s'],
  ]);
  const delCol = transformTableMatrix(withCol!, 'col-delete', 1, 1);
  assert.deepEqual(delCol, initial);
  const delRow = transformTableMatrix(delCol!, 'row-delete', 1, 0);
  assert.deepEqual(delRow, [
    ['模式', '耗时'],
    ['parallel', '3.4s'],
  ]);
  // Deleting last remaining body row returns null so caller removes whole table
  assert.equal(transformTableMatrix(delRow!, 'row-delete', 1, 0), null);
});
