import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWeixinHtml } from './weixinRenderer.ts';

/**
 * 公众号编辑器粘贴时会删 class / <style>，并且（新版编辑器）会重写原生 ul/ol/li 与 blockquote、
 * 吞掉 <pre> 里的换行和行首空格。这里断言复制出去的 HTML 不依赖这些会被改写的结构。
 */
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];

test('公众号粘贴保真：代码块不用 <pre>，换行写成 <br>、缩进写成 &nbsp;，高亮仍是内联颜色', () => {
  const html = renderWeixinHtml(['```js', 'function f() {', '    return 1;', '}', '```'].join('\n')).html;
  assert.equal(tags(html, 'pre').length, 0, html);
  assert.ok(html.includes('<br>'), '每行之间要有 <br>');
  assert.ok(html.includes('&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #d73a49; font-weight: 600;">return</span>'), html);
  assert.ok(!/\n/.test(html), '复制出去的 HTML 里不能靠 \\n 换行');
  assert.ok(!html.includes('display: flex'), '代码块标题栏不用 flex（公众号可能删掉）');
});

test('公众号粘贴保真：列表不用原生 ul/ol/li，二级列表保留缩进，有序列表保留起始编号', () => {
  const md = ['- 一级', '  - 二级', '    - 三级', '- 一级二', '', '3. 第三', '4. 第四', '', '- [x] 已完成'].join('\n');
  const html = renderWeixinHtml(md).html;
  for (const t of ['ul', 'ol', 'li']) assert.equal(tags(html, t).length, 0, `${t}: ${html}`);
  const row = (text: string) => (html.match(/<p\b[^>]*>.*?<\/p>/g) ?? []).find((p) => p.includes(text)) ?? '';
  const pad = (text: string) => Number(/padding-left: ([\d.]+)em/.exec(row(text))?.[1] ?? NaN);
  assert.ok(pad('二级') > pad('一级'), `二级要比一级缩进多: ${row('二级')}`);
  assert.ok(pad('三级') > pad('二级'), `三级要比二级缩进多: ${row('三级')}`);
  const text = html.replace(/<[^>]+>/g, '');
  assert.ok(text.includes('3.') && text.includes('第三') && text.includes('4.'), text);
  assert.ok(!text.includes('1.'), `有序列表从 3 开始: ${text}`);
  assert.ok(text.includes('☑'), text);
});

test('公众号粘贴保真：引用、嵌套引用、callout 用带内联样式的 section，不用 blockquote', () => {
  const md = ['> 外层', '> > 内层', '', '> [!WARNING]', '> 小心'].join('\n');
  const html = renderWeixinHtml(md).html;
  assert.equal(tags(html, 'blockquote').length, 0, html);
  const quotes = tags(html, 'section').filter((s) => s.includes('border-left: 4px solid'));
  assert.equal(quotes.length, 3, `外层、内层、callout 各一个引用框: ${html}`);
  assert.ok(quotes.some((s) => s.includes('#9a6700')), 'callout 保留自己的颜色');
});

test('公众号粘贴保真：所有元素都带内联 style，没有 class', () => {
  const md = [
    '# 标题', '', '> 引用', '', '```py', 'x = 1', '```', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- 项', '1. 项', '',
    '正文 **粗** *斜* ~~删~~ `码`',
  ].join('\n');
  const html = renderWeixinHtml(md).html;
  assert.ok(!html.includes('class='));
  const bare = (html.match(/<(?!\/)(?!br\b|tr\b|thead\b|tbody\b)[a-z0-9]+\b(?![^>]*\bstyle=")[^>]*>/g) ?? []);
  assert.deepEqual(bare, [], '除 br/tr/thead/tbody 外每个元素都要带内联 style');
});

test('公众号粘贴保真：公式不被当成强调语法改坏；有渲染函数时换成它给的 SVG', () => {
  const md = '行内 $a*b*c$ 和 $x_1$。\n\n$$\nE = mc^2\n$$\n\n> 引用里 $y*z*w$';
  const raw = renderWeixinHtml(md).html;
  assert.ok(!raw.includes('<em'), `公式里的 * 不能变成斜体: ${raw}`);
  assert.ok(raw.includes('$a*b*c$') && raw.includes('$y*z*w$'), raw);

  const seen: Array<[string, boolean]> = [];
  const html = renderWeixinHtml(md, {
    renderMath: (tex, display) => {
      seen.push([tex, display]);
      return `<svg style="vertical-align: -0.2ex;" data-tex="${display ? 'B' : 'I'}"></svg>`;
    },
  }).html;
  assert.deepEqual(seen.map(([, d]) => d).sort(), [false, false, false, true]);
  assert.ok(seen.some(([t, d]) => t === 'E = mc^2' && d), JSON.stringify(seen));
  assert.ok(!html.includes('$'), `有 SVG 时不再留 $ 源码: ${html}`);
  assert.ok(/<section style="[^"]*text-align: center;[^"]*"><svg[^>]*data-tex="B"/.test(html), '行间公式单独成块居中');
  assert.ok(!/<p\b[^>]*><section/.test(html), '行间公式不能套在 <p> 里');
});

test('公众号粘贴保真：代码里的 $ 不当公式处理', () => {
  const html = renderWeixinHtml('```sh\necho $HOME $PATH\n```\n\n用 `$x$` 表示').html;
  assert.ok(html.includes('$HOME'), html);
  assert.ok(html.includes('$x$'), html);
});
