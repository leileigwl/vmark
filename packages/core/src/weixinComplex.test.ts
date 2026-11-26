import assert from 'node:assert/strict';
import test from 'node:test';
import { extractWeixinDigest, renderWeixinHtml } from './weixinRenderer.ts';

const COMPLEX_ARTICLE = `---
title: Vmark 复杂技术长文全链路渲染测试
tags:
  - Markdown
  - 公众号排版
date: 2026-11-25
---

# Vmark 复杂技术长文全链路渲染测试

这是一段包含**加粗**、*斜体*、行内代码 \`const mode = 'draft'\` 以及行内公式 $E = mc^2$ 的导语，同时引用了 [Vmark 项目主页](https://github.com/leileigwl/vmark) 与 [公众号历史文章](https://mp.weixin.qq.com/s/vmark-demo)。

> [!NOTE]
> 核心特性：所有局部图片保持 \`./assets/\` 相对路径，仅在分发时异步转存。

> [!WARNING]
> 注意事项：严禁直接覆盖平台已发布内容，默认仅写入草稿箱。

## 一、架构配图与双栏数据表

![系统架构示意图](./assets/arch-diagram.png)

| 平台 | 封面比例 | 推送模式 | 校验方式 |
| :--- | :--- | :--- | :--- |
| 微信公众号 | 2.35:1 / 1:1 | 草稿箱 | appmsgid 回查 |
| 小红书 | 3:4 | 卡片草稿 | 逐张栅格化 |
| 知乎专栏 | 16:9 | 草稿箱 | API 状态码 |

## 二、嵌套列表与任务清单

1. 准备本地素材：
   - 16:9 横版主图（1280×720）
   - 2.35:1 公众号头条封面（940×400）
   - 3:4 社交卡片图（900×1200）
2. 执行多平台分发校验：
   - [x] 本地 AST 编译与代码高亮
   - [ ] 创作者终审后点击发布

## 三、公式、流程图与代码片段

$$
\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^{N} (y_i - \\hat{y}_i)^2
$$

\`\`\`mermaid
flowchart LR
  MD[Markdown] --> AST[Platform AST]
  AST --> Draft[Platform Draft Box]
\`\`\`

\`\`\`ts
export async function dispatchDraft(title: string): Promise<number> {
  const start = 100;
  // comment inside code fence
  return start + title.length;
}
\`\`\`
`;

test('renderWeixinHtml compiles complex article with math, mermaid, callouts, tables, nested lists, and footnotes', () => {
  const mathCalls: Array<{ tex: string; display: boolean }> = [];
  const res = renderWeixinHtml(COMPLEX_ARTICLE, {
    accentColor: '#2563eb',
    coverImageUrl: 'https://mmbiz.qpic.cn/cover-235/0',
    showCoverInBody: true,
    renderMath: (tex, display) => {
      mathCalls.push({ tex, display });
      return display
        ? `<section data-math="block" style="text-align:center;">SVG(${tex})</section>`
        : `<span data-math="inline">SVG(${tex})</span>`;
    },
  });

  // 1. 纯内联样式，无 class / <style>
  assert.ok(res.html.startsWith('<section style="'));
  assert.ok(!res.html.includes('class='));
  assert.ok(!res.html.includes('<style'));

  // 2. Frontmatter 已剥离且封面插入正文顶部
  assert.ok(!res.html.includes('date: 2026-11-25'));
  assert.ok(res.html.includes('src="https://mmbiz.qpic.cn/cover-235/0"'));

  // 3. Callouts / 表格 / 图片 / 嵌套列表 / 代码高亮 / Mermaid
  assert.ok(res.html.includes('提示'));
  assert.ok(res.html.includes('注意'));
  assert.ok(res.html.includes('<table style="'));
  assert.ok(res.html.includes('微信公众号'));
  assert.ok(res.html.includes('./assets/arch-diagram.png'));
  assert.ok(res.html.includes('16:9 横版主图'));
  assert.ok(res.html.includes('mermaid'));
  assert.ok(res.html.includes('color: #d73a49;'), 'TypeScript keywords highlighted');

  // 4. 公式（行内 + 块级）回调命中
  assert.equal(mathCalls.length, 2);
  assert.equal(mathCalls[0]?.display, false);
  assert.equal(mathCalls[1]?.display, true);
  assert.ok(res.html.includes('data-math="inline"'));
  assert.ok(res.html.includes('data-math="block"'));

  // 5. 外链转脚注，微信域名保留原文超链接
  assert.equal(res.footnotes.length, 1);
  assert.equal(res.footnotes[0]?.url, 'https://github.com/leileigwl/vmark');
  assert.ok(res.html.includes('href="https://mp.weixin.qq.com/s/vmark-demo"'));
  assert.ok(!res.html.includes('href="https://github.com/leileigwl/vmark"'));

  // 6. 摘要与图片收集正确
  assert.ok(res.imageUrls.includes('https://mmbiz.qpic.cn/cover-235/0'));
  assert.ok(res.imageUrls.includes('./assets/arch-diagram.png'));
  const digest = extractWeixinDigest(COMPLEX_ARTICLE);
  assert.ok(digest.length > 20 && digest.length <= 120);
  assert.ok(!digest.includes('---'));
});
