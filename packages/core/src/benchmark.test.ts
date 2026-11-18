import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  renderZhihuHtml,
  parseCsdnMarkdown,
  renderBaijiahaoHtml,
  renderXiaohongshuCards,
  renderWeixinHtml,
} from './index.ts';

const BENCHMARK_MD_PATH = '/Users/leileigwl/Documents/VCatBlogs/深入解析现代前端富文本与AST渲染管线.md';

function getBenchmarkMarkdown(): string {
  if (fs.existsSync(BENCHMARK_MD_PATH)) {
    return fs.readFileSync(BENCHMARK_MD_PATH, 'utf-8');
  }
  // Embedded fallback with identical benchmark article structure
  return `---
title: "深入解析现代前端富文本与 AST 渲染管线"
tags: [前端架构, TypeScript, Markdown, 富文本]
categories: [前端工程]
author: "Vmark Studio"
digest: "本文从 Markdown 抽象语法树（AST）出发，深度解析现代富文本排版引擎如何打通微信公众号、知乎与博客园等异构平台的高保真渲染管线。"
coverImageUrl: "./assets/pipeline-architecture.png"
showCoverInBody: true
---

# 深入解析现代前端富文本与 AST 渲染管线

现代技术创作者通常面临严峻的内容分发割裂困境。

![AST 渲染与分发架构](./assets/pipeline-architecture.png)

> [!NOTE]
> 本文介绍的 AST 转换引擎遵循 **「单向不可逆只读渲染」** 哲学。

---

## 1. 异构平台分发的核心差异矩阵

| 平台属性 | 微信公众号 | 知乎专栏 | 博客园 (Cnblogs) | 稀土掘金 |
| :--- | :--- | :--- | :--- | :--- |
| **底层内容载体** | 全内联 CSS HTML | 专栏 HTML 片段 | 标准 GFM Markdown | 纯净 Markdown (mark_content) |
| **代码块风格** | Mac 拟态三色胶囊圆点 | 原生 Prism \`<pre><code>\` | 用户高亮主题接管 | 平台原生主题 |

---

## 2. 转换器核心实现：基于 AST 的平台分支派生

\`\`\`typescript
export interface CodeBlockNode {
  language: string;
  code: string;
}

export function transformCodeBlock(node: CodeBlockNode): string {
  return node.code.trim();
}
\`\`\`

---

## 3. 防盗链图片转存与 Referer 伪装管线

\`\`\`rust
pub async fn fetch_with_safe_referer(image_url: &str) -> Result<Vec<u8>, DownloadError> {
    Ok(vec![])
}
\`\`\`

---

## 4. 引用与相关资料

在微信公众号排版引擎中，以下外链将被自动转换为文末带序号的脚注：
- TypeScript 官方 AST 规范文档：[TypeScript AST Docs](https://www.typescriptlang.org/docs/)
- Vditor 现代 Markdown 编辑器内核：[Vditor GitHub](https://github.com/Vanessa219/vditor)
- Vmark 本地优先跨平台发布引擎：[Vmark 架构设计](https://github.com/leileigwl/vmark)
`;
}

test('Benchmark Article: Weixin draft conversion strictly satisfies WeChat format specs', () => {
  const md = getBenchmarkMarkdown();
  const csdn = parseCsdnMarkdown(md);

  const weixin = renderWeixinHtml(md, {
    coverImageUrl: 'https://mmbiz.qpic.cn/assets/pipeline-architecture.png',
    showCoverInBody: true,
  });

  // 1. WeChat forbids <style> tags and class-based stylesheets
  assert.ok(!weixin.html.includes('<style>'), 'Weixin HTML must not contain <style> tags');
  assert.ok(!weixin.html.includes('<style '), 'Weixin HTML must not contain <style ...> tags');
  assert.ok(!/\bclass="[^"]*"/.test(weixin.html), 'Weixin HTML must not contain class attributes');

  // 2. Mac-style 3 dots in code blocks
  assert.ok(weixin.html.includes('#ff5f56'), 'Must contain Mac red dot');
  assert.ok(weixin.html.includes('#ffbd2e'), 'Must contain Mac yellow dot');
  assert.ok(weixin.html.includes('#27c93f'), 'Must contain Mac green dot');
  assert.ok(weixin.html.includes('background:#1e1e1e'), 'Must contain dark code block background');

  // 3. External links converted to numbered footnotes
  assert.ok(weixin.html.includes('参考链接'), 'Must append footnotes section');
  assert.ok(weixin.html.includes('[1]</sup>'), 'Must have footnote [1]');
  assert.ok(weixin.html.includes('https://www.typescriptlang.org/docs/'), 'Must include external link URL in footnotes');
  assert.equal(weixin.footnotes.length, 3, 'Must extract all 3 external footnotes');

  // 4. Inlined cover image
  assert.ok(
    weixin.html.includes('https://mmbiz.qpic.cn/assets/pipeline-architecture.png'),
    'Must inject cover image when showCoverInBody is true'
  );
});

test('Benchmark Article: Zhihu draft conversion demotes headings, wraps figures, and formats Prism blocks', () => {
  const md = getBenchmarkMarkdown();
  const zhihu = renderZhihuHtml(md);

  // 1. Heading demotion: H1 -> H2, H2 -> H3
  assert.ok(
    zhihu.html.includes('<h2>深入解析现代前端富文本与 AST 渲染管线</h2>'),
    'H1 must be demoted to H2 for Zhihu outline'
  );
  assert.ok(
    zhihu.html.includes('<h3>1. 异构平台分发的核心差异矩阵</h3>'),
    'H2 must be demoted to H3 for Zhihu'
  );

  // 2. Native Prism pre/code blocks
  assert.ok(
    zhihu.html.includes('<pre><code class="language-typescript">'),
    'Must output native language-typescript pre/code'
  );
  assert.ok(
    zhihu.html.includes('<pre><code class="language-rust">'),
    'Must output native language-rust pre/code'
  );

  // 3. Zhihu figure image container
  assert.ok(
    zhihu.html.includes('data-size="normal"'),
    'Must wrap images in Zhihu figure with data-size="normal"'
  );
  assert.ok(zhihu.html.includes('<figure><img'), 'Must have <figure><img structure');
});

test('Benchmark Article: CSDN parser cleanly extracts frontmatter and preserves GFM Markdown', () => {
  const md = getBenchmarkMarkdown();
  const csdn = parseCsdnMarkdown(md);

  assert.equal(csdn.title, '深入解析现代前端富文本与 AST 渲染管线');
  assert.ok(csdn.tags.includes('TypeScript'));
  assert.ok(csdn.tags.includes('Markdown'));
  assert.ok(csdn.categories.includes('前端工程'));

  // Frontmatter must be cleanly stripped from the body
  assert.ok(!csdn.markdown.startsWith('---'), 'Markdown must not retain leading frontmatter');
  assert.ok(csdn.markdown.includes('```typescript'));
  assert.ok(csdn.markdown.includes('```rust'));
  assert.ok(csdn.markdown.includes('| 平台属性 | 微信公众号 |'));
});

test('Benchmark Article: Baijiahao conversion produces semantic HTML with sanitized code blocks', () => {
  const md = getBenchmarkMarkdown();
  const bjh = renderBaijiahaoHtml(md);

  assert.ok(bjh.html.includes('<h2>深入解析现代前端富文本与 AST 渲染管线</h2>'));
  assert.ok(bjh.html.includes('<h2>1. 异构平台分发的核心差异矩阵</h2>'));
  assert.ok(bjh.html.includes('<pre><code class="language-typescript">'));
  assert.ok(bjh.html.includes('<pre><code class="language-rust">'));
  assert.ok(bjh.html.includes('<img src='));
});

test('Benchmark Article: Xiaohongshu conversion generates 3:4 cards and caption with tag matrix', () => {
  const md = getBenchmarkMarkdown();
  const xhs = renderXiaohongshuCards(md);

  assert.ok(xhs.cards.length >= 4, `Expected at least 4 cards, got ${xhs.cards.length}`);
  const coverCard = xhs.cards.find((c) => c.type === 'cover');
  assert.ok(coverCard, 'Must generate cover card');
  assert.ok(coverCard.title.includes('深入解析现代前端富文本'));

  const codeCard = xhs.cards.find((c) => c.type === 'code');
  assert.ok(codeCard, 'Must generate code card');

  // Caption contains tags
  assert.ok(xhs.captionText.includes('#TypeScript') || xhs.captionText.includes('#前端架构'));
});
