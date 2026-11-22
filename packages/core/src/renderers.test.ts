import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderZhihuHtml,
  parseCsdnMarkdown,
  renderBaijiahaoHtml,
  renderXiaohongshuCards,
} from './index.ts';

test('renderZhihuHtml demotes H1 to H2, outputs native pre/code and figure/img', () => {
  const md = `---
title: 测试知乎
---
# 大标题 (H1)
这是一段导读文字。
## 二级标题 (H2)
\`\`\`typescript
const zhihu = 'native-prism';
console.log(zhihu);
\`\`\`
![架构图](https://picx.zhimg.com/v2-abc.png)
`;

  const result = renderZhihuHtml(md);
  assert.ok(result.html.includes('<h2>大标题 (H1)</h2>'), 'H1 should be demoted to H2');
  assert.ok(result.html.includes('<h3>二级标题 (H2)</h3>'), 'H2 should be demoted to H3');
  assert.ok(
    result.html.includes('<pre><code class="language-typescript">const zhihu = \'native-prism\';\nconsole.log(zhihu);</code></pre>'),
    'Should output native Zhihu Prism code block'
  );
  assert.ok(
    result.html.includes('<figure><img src="https://picx.zhimg.com/v2-abc.png" data-actualsrc="https://picx.zhimg.com/v2-abc.png" data-size="normal" alt="架构图"/></figure>'),
    'Should wrap image in Zhihu figure element'
  );
  assert.equal(result.imageUrls.length, 1);
  assert.equal(result.imageUrls[0], 'https://picx.zhimg.com/v2-abc.png');
});

test('parseCsdnMarkdown extracts frontmatter, images, and strips frontmatter cleanly', () => {
  const md = `---
title: "CSDN 发布测试"
tags: [TypeScript, Electron]
categories: [前端工程]
---
# 导言
测试 CSDN markdown 清洗与提取。
![配图](./assets/cover.png)
`;

  const result = parseCsdnMarkdown(md);
  assert.equal(result.title, 'CSDN 发布测试');
  assert.deepEqual(result.tags, ['TypeScript', 'Electron']);
  assert.deepEqual(result.categories, ['前端工程']);
  assert.ok(!result.markdown.startsWith('---'), 'Should strip frontmatter from markdown body');
  assert.ok(result.markdown.includes('# 导言'));
  assert.equal(result.imageUrls.length, 1);
  assert.equal(result.imageUrls[0], './assets/cover.png');
});

test('renderBaijiahaoHtml outputs semantic HTML with h2, p, pre/code and images', () => {
  const md = `# 百家号标题
百家号正文内容。
\`\`\`bash
pnpm test
\`\`\`
![百度配图](https://bjh.baidu.com/img.jpg)
`;

  const result = renderBaijiahaoHtml(md);
  assert.ok(result.html.includes('<h2>百家号标题</h2>'));
  assert.ok(result.html.includes('<pre><code class="language-bash">pnpm test</code></pre>'));
  assert.ok(result.html.includes('<img src="https://bjh.baidu.com/img.jpg"'));
  assert.equal(result.imageUrls.length, 1);
});

test('Renderers robustly handle GFM tildes, info strings, and C++ code blocks', () => {
  const md = `
~~~c++
#include <iostream>
int main() {
    return 0;
}
~~~

\`\`\`typescript {1-3} title="test.ts"
const x: number = 42;
\`\`\`
`;

  const zhihu = renderZhihuHtml(md);
  assert.ok(zhihu.html.includes('<code class="language-c++">'));
  assert.ok(zhihu.html.includes('<code class="language-typescript">'));

  const bjh = renderBaijiahaoHtml(md);
  assert.ok(bjh.html.includes('<code class="language-c++">'));
  assert.ok(bjh.html.includes('<code class="language-typescript">'));

  const xhs = renderXiaohongshuCards(md);
  assert.ok(xhs.cards.some((c) => c.type === 'code' && c.codeLang === 'c++'));
  assert.ok(xhs.cards.some((c) => c.type === 'code' && c.codeLang === 'typescript'));
});

test('renderXiaohongshuCards creates cover, content, code cards and caption text', () => {
  const md = `---
title: "小红书 3:4 视觉图集测试"
tags: [前端, 算法]
---
# 第一节：引言
这是一条用于小红书轮播的测试笔记。
包含一些核心关键点。
\`\`\`python
def hello():
    print("XHS Card")
\`\`\`
`;

  const result = renderXiaohongshuCards(md);
  assert.equal(result.title, '小红书 3:4 视觉图集测试');
  assert.ok(result.cards.some((c) => c.type === 'cover'), 'Should contain cover card');
  assert.ok(result.cards.some((c) => c.type === 'code'), 'Should contain code card');
  assert.ok(result.captionText.includes('#前端'));
  assert.ok(result.captionText.includes('#算法'));
  assert.ok(result.cards.length <= 18, 'Must not exceed 18 cards');
});

test('renderZhihuHtml formats [!NOTE] callouts cleanly without raw [!NOTE] marker', () => {
  const result = renderZhihuHtml('> [!NOTE]\n> 这是知乎提示内容');
  assert.ok(result.html.includes('<strong>ℹ️ 提示</strong>'));
  assert.ok(result.html.includes('这是知乎提示内容'));
  assert.ok(!result.html.includes('[!NOTE]'));
});

test('renderBaijiahaoHtml formats [!NOTE] callouts and Markdown tables into semantic HTML', () => {
  const result = renderBaijiahaoHtml('> [!NOTE]\n> 这是百家号提示内容\n\n| 平台 | 模式 |\n| :--- | :--- |\n| 百家号 | 草稿箱 |');
  assert.ok(result.html.includes('<strong>ℹ️ 提示</strong>'));
  assert.ok(result.html.includes('这是百家号提示内容'));
  assert.ok(!result.html.includes('[!NOTE]'));
  assert.ok(result.html.includes('<table><thead><tr><th>平台</th><th>模式</th></tr></thead><tbody><tr><td>百家号</td><td>草稿箱</td></tr></tbody></table>'));
});
