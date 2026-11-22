import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSocialCardHtml, renderXiaohongshuCards } from '@vcat/core';
import { getCardMathRenderer } from '../src/main/socialCardMath.ts';

const MD = '# 公式卡片\n\n质能方程 $E=mc^2$ 很有名。\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n';

test('出图用的卡片 HTML 含 KaTeX 排版，而不是 Unicode 近似', async () => {
  const math = await getCardMathRenderer();
  const deck = renderXiaohongshuCards(MD, { fallbackTitle: 't' });
  const html = renderSocialCardHtml(deck.cards[1], { themeId: 'ios-memo', cardIndex: 1, totalCards: 2, math });
  assert.match(html, /<span class="katex-display">/);
  assert.match(html, /class="mfrac"/);
  assert.ok((html.match(/class="katex"/g) ?? []).length >= 2, 'inline + display formula');
  assert.ok(!html.includes('(1)/(3)') && !html.includes('E=mc^2'), 'no fallback text');
});

test('KaTeX 样式内联且字体指向本地文件（离线可用）', async () => {
  const { css } = await getCardMathRenderer();
  assert.ok(css.includes('.katex'));
  const fonts = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1]);
  assert.ok(fonts.length > 10);
  fonts.forEach((u) => assert.match(u, /^file:\/\/.+\/katex\/dist\/fonts\/KaTeX_/));
});
