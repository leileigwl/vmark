import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCardBlocks } from './socialCardBlocks.ts';
import { renderWeixinHtml } from './weixinRenderer.ts';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';
import { markdownToPlainText } from './socialPlainText.ts';

/** 复现用户截图：引用里有嵌套引用、编辑器转义过的围栏标记 ``\`，后面跟一个 [!TIP] callout。 */
const SAMPLE = [
  '# 独立开发者的高效内容矩阵与全平台分发',
  '',
  '很多独立开发者把 90% 的精力放在了写代码上。',
  '',
  '> sfsafsafas',
  '>',
  '> fsdfaf',
  '> > sfdsafsfsafsafas',
  '>',
  '> fsdfaf',
  '> > sfdsaf',
  '>',
  '> ``\\`',
  '',
  '> [!TIP]',
  '> 优质内容的本质是一次创作、多端自适应交付。',
  '',
  '## 一、极简 3 步内容飞轮',
  '',
  '1. 单点源头创作：使用本地 Markdown。',
  '2. 多端自适应渲染。',
].join('\n');

const visibleText = (html: string) => html.replace(/<[^>]+>/g, '\n').replace(/&gt;/g, '>').replace(/&lt;/g, '<');

test('公众号：嵌套引用不把 > 当文本，转义后的围栏标记不残留反引号', () => {
  const text = visibleText(renderWeixinHtml(SAMPLE).html);
  assert.ok(!text.includes('`'), `不应残留反引号: ${text}`);
  assert.ok(!/>\s*sfds/.test(text), `嵌套引用的 > 不应作为文本出现: ${text}`);
  assert.ok(text.includes('sfdsafsfsafsafas'));
  assert.ok(text.includes('💡 技巧'));
  assert.ok(!text.includes('[!TIP]'));
});

test('公众号：引用里的围栏代码块渲染成代码块；未闭合且为空的围栏直接丢弃', () => {
  const md = ['> 看代码：', '> ```js', '> const a = 1;', '> ```', '', '> 结尾', '> ```', '', '正文继续'].join('\n');
  const html = renderWeixinHtml(md).html;
  assert.ok(html.includes('font-family: Menlo, Monaco, Consolas, monospace; font-size: 13px;'), '引用内代码块应渲染为代码块（公众号版不用 <pre>）');
  assert.ok(html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').includes('const a = 1;'), '代码内容完整（高亮 span 去掉、&nbsp; 还原成空格后）');
  assert.ok(!visibleText(html).includes('```'));
  assert.ok(visibleText(html).includes('正文继续'), '引用里未闭合的围栏不能吞掉后面的正文');
});

test('卡片：嵌套引用拆成独立引用块，转义围栏不残留，callout 转成「💡 技巧：」', () => {
  const quotes = parseCardBlocks(SAMPLE).filter((b) => b.kind === 'quote').map((b) => (b as { text: string }).text);
  assert.ok(quotes.includes('sfdsafsfsafsafas'), JSON.stringify(quotes));
  assert.ok(quotes.every((q) => !q.includes('`') && !q.includes('> ') && !q.includes('[!')), JSON.stringify(quotes));
  assert.ok(quotes.some((q) => q.startsWith('💡 技巧：优质内容')), JSON.stringify(quotes));
});

test('卡片：引用里的围栏代码块成为 code 块', () => {
  const blocks = parseCardBlocks(['> ```ts', '> let x = 1;', '> ```'].join('\n'));
  assert.deepEqual(blocks, [{ kind: 'code', lang: 'ts', lines: ['let x = 1;'] }]);
});

test('纯文本正文：去掉 Markdown 标记，保留段落换行，不重复标题', () => {
  const plain = markdownToPlainText(SAMPLE, { title: '独立开发者的高效内容矩阵与全平台分发' });
  assert.ok(!/[>`#*]|\[!/.test(plain), plain);
  assert.ok(!plain.includes('独立开发者的高效内容矩阵与全平台分发'), '标题已单独填写，正文不再重复');
  assert.ok(plain.includes('💡 技巧：优质内容的本质'));
  assert.ok(plain.includes('\n一、极简 3 步内容飞轮\n'), plain);
  assert.ok(plain.includes('1. 单点源头创作'));
  assert.ok(plain.split('\n').length >= 8, `应保留段落换行: ${JSON.stringify(plain)}`);
});

test('小红书 captionText 是纯文本正文 + 话题，不以标题开头', () => {
  const deck = renderXiaohongshuCards(SAMPLE, '独立开发者的高效内容矩阵与全平台分发');
  assert.ok(!deck.captionText.startsWith('独立开发者的高效内容矩阵'), deck.captionText);
  assert.ok(!deck.captionText.includes('[!TIP]'));
  assert.ok(deck.captionText.includes('\n'));
});
