import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cardBlockHtml, cardInlineHtml } from './socialCardBlocksHtml.ts';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import { getSocialCardTheme } from './socialCardThemes.ts';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';
import type { CardMathRenderer } from './socialCardMath.ts';

/** Stand-in for KaTeX: records what it was asked to render. */
const fake: CardMathRenderer = {
  render: (tex, display) => `<span class="katex${display ? ' katex-display' : ''}" data-tex="${tex}">K</span>`,
  css: '.katex{font-family:KaTeX_Main}',
};
const t = getSocialCardTheme('ios-memo');

describe('cards render formulas through the math renderer instead of a Unicode fallback', () => {
  it('display formula ($$…$$) uses the renderer in display mode', () => {
    const html = cardBlockHtml({ kind: 'math', tex: '\\int_0^1 x^2\\,dx' }, t, undefined, fake);
    assert.match(html, /class="katex katex-display" data-tex="\\int_0\^1 x\^2\\,dx"/);
    assert.ok(!html.includes('∫'), 'no Unicode approximation');
  });

  it('inline formula ($E=mc^2$) inside a paragraph uses the renderer in inline mode', () => {
    const html = cardBlockHtml({ kind: 'paragraph', text: '质能方程 $E=mc^2$ 很**有名**。' }, t, undefined, fake);
    assert.match(html, /质能方程 <span class="katex" data-tex="E=mc\^2">K<\/span> 很<strong>有名<\/strong>。/);
  });

  it('prices like $5 and $10 are not treated as formulas', () => {
    assert.equal(cardInlineHtml('门票 $5 到 $10 不等', fake), '门票 $5 到 $10 不等');
  });

  it('without a renderer the offline fallback stays', () => {
    assert.match(cardBlockHtml({ kind: 'math', tex: 'x^2' }, t), /x²/);
  });

  it('a whole card injects the math stylesheet only when it contains a formula', () => {
    const deck = renderXiaohongshuCards('# 公式\n\n正文 $E=mc^2$。\n\n$$\n\\sum_{i=1}^n i\n$$\n', { fallbackTitle: 't' });
    const body = deck.cards[1];
    const html = renderSocialCardHtml(body, { themeId: 'ios-memo', cardIndex: 1, totalCards: 2, math: fake });
    assert.ok(html.includes('.katex{font-family:KaTeX_Main}'));
    assert.ok(html.includes('data-tex="\\sum_{i=1}^n i"'));
    const cover = renderSocialCardHtml(deck.cards[0], { themeId: 'ios-memo', cardIndex: 0, totalCards: 2, math: fake });
    assert.ok(!cover.includes('KaTeX_Main'));
  });
});
