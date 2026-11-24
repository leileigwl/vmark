import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cardBlockHtml, cardInlineHtml } from './socialCardBlocksHtml.ts';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import { getSocialCardTheme } from './socialCardThemes.ts';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';
import { createKatexCardMath, type CardMathRenderer, type KatexLike } from './socialCardMath.ts';

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

describe('long display formulas can wrap inside the card', () => {
  const calls: { tex: string; displayMode: boolean }[] = [];
  const katex: KatexLike = {
    renderToString: (tex, o) => {
      calls.push({ tex, displayMode: o.displayMode });
      // 与真实 KaTeX 一致：\tag / align 只能在 display 模式里排，inline 模式下输出 katex-error
      if (!o.displayMode && /\\tag|\\begin\{align\}/.test(tex)) return `<span class="katex-error">${tex}</span>`;
      return `<span class="katex">${tex}</span>`;
    },
  };
  const math = createKatexCardMath(katex, '');

  it('display formulas use \\displaystyle in inline mode (wraps after = / +) inside a .katex-display box', () => {
    calls.length = 0;
    const html = math.render('a + b = c', true);
    assert.deepEqual(calls, [{ tex: '\\displaystyle a + b = c', displayMode: false }]);
    assert.equal(html, '<span class="katex-display b-math-wrap"><span class="katex">\\displaystyle a + b = c</span></span>');
  });

  it('what inline mode cannot typeset (\\tag, align) falls back to real display mode', () => {
    for (const tex of ['E = mc^2 \\tag{1}', '\\begin{align} a &= b \\end{align}']) {
      calls.length = 0;
      assert.equal(math.render(tex, true), `<span class="katex">${tex}</span>`);
      assert.deepEqual(calls, [
        { tex: `\\displaystyle ${tex}`, displayMode: false },
        { tex, displayMode: true },
      ]);
    }
  });

  it('inline formulas are unchanged', () => {
    calls.length = 0;
    assert.equal(math.render('x^2', false), '<span class="katex">x^2</span>');
    assert.deepEqual(calls, [{ tex: 'x^2', displayMode: false }]);
  });
});
