import assert from 'node:assert/strict';
import test from 'node:test';
import { extractWeixinDigest, renderWeixinHtml } from './weixinRenderer.ts';

test('renderWeixinHtml produces pure inline-styled HTML with no <style> or class attributes', () => {
  const md = [
    '# 主标题',
    '',
    '正文包含 **加粗**、*斜体*、~~删除~~ 与 `const a = 1`。',
    '',
    '> 引用卡片内容',
    '',
    '```ts',
    'console.log("vmark");',
    '```',
    '',
    '| 列A | 列B |',
    '| --- | --- |',
    '| 1 | 2 |',
  ].join('\n');

  const res = renderWeixinHtml(md, { accentColor: '#c47c2b' });
  assert.ok(res.html.startsWith('<section style="'));
  assert.ok(!res.html.includes('<style'));
  assert.ok(!res.html.includes('class='));
  assert.ok(res.html.includes('#c47c2b'));
  assert.ok(res.html.includes('<h1 style="'));
  assert.ok(res.html.includes('<blockquote style="'));
  assert.ok(res.html.includes('<pre style="'));
  assert.ok(res.html.includes('<table style="'));
});

test('renderWeixinHtml converts external links to numbered footnotes while keeping mp.weixin.qq.com links', () => {
  const md =
    '参考 [官方文档](https://example.com/docs) 以及 [公众号文章](https://mp.weixin.qq.com/s/123)。';
  const res = renderWeixinHtml(md);

  assert.equal(res.footnotes.length, 1);
  assert.equal(res.footnotes[0].url, 'https://example.com/docs');
  assert.ok(res.html.includes('[1]</sup>'));
  assert.ok(res.html.includes('参考链接'));
  assert.ok(res.html.includes('href="https://mp.weixin.qq.com/s/123"'));
  assert.ok(!res.html.includes('href="https://example.com/docs"'));
});

test('renderWeixinHtml injects cover image when showCoverInBody is true and extracts clean digest', () => {
  const md = '---\ntitle: Demo\n---\n\n## 第一节\n\n这里是**核心摘要**内容，用于测试自动提取。';
  const res = renderWeixinHtml(md, {
    coverImageUrl: 'https://mmbiz.qpic.cn/cover.png',
    showCoverInBody: true,
  });

  assert.ok(res.html.includes('src="https://mmbiz.qpic.cn/cover.png"'));
  assert.ok(res.imageUrls.includes('https://mmbiz.qpic.cn/cover.png'));
  assert.equal(
    extractWeixinDigest(md),
    '第一节 这里是核心摘要内容，用于测试自动提取。'
  );
});

test('renderWeixinHtml handles GFM tilde fences, C++, info strings, and highlights tokens without class names', () => {
  const md = `
~~~c++
// 这是一个 C++ 注释
#include <iostream>
int main() {
    const int val = 100;
    return 0;
}
~~~

\`\`\`ts {1-5} title="demo.ts"
import { test } from 'vitest';
const isTrue = true;
\`\`\`
`;

  const res = renderWeixinHtml(md);
  assert.ok(res.html.includes('c++'));
  assert.ok(res.html.includes('demo.ts') || res.html.includes('ts'));
  assert.ok(res.html.includes('font-style: italic;'), 'Comment should be styled italic');
  assert.ok(res.html.includes('color: #d73a49;'), 'Keywords (const/return/import) should be highlighted');
  assert.ok(res.html.includes('color: #005cc5;'), 'Numbers/booleans should be highlighted');
  assert.ok(!res.html.includes('class='), 'Must not contain any class attributes');
});
