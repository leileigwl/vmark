import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import { renderCardMeasureHtml, texToText } from './socialCardBlocksHtml.ts';
import { SOCIAL_CARD_PRESETS, getSocialCardTheme, getCardContentBox } from './socialCardThemes.ts';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';
import { SAMPLE } from './socialCardSample.fixture.ts';

describe('social card templates and block HTML', () => {
  it('ships at least five templates, each with its own content box', () => {
    const ids = Object.keys(SOCIAL_CARD_PRESETS);
    assert.ok(ids.length >= 5);
    assert.ok(ids.includes('fresh-gradient'));
    for (const id of ids) {
      const box = getCardContentBox(id, '3:4');
      assert.ok(box.width > 900 && box.width < 1100, `${id} width ${box.width}`);
      assert.ok(box.height > 1200 && box.height < 1450, `${id} height ${box.height}`);
    }
    assert.equal(getSocialCardTheme('mint-gradient').id, 'fresh-gradient');
  });

  it('renders every block kind of a flowed card at 1242×1656 without remote resources', () => {
    const deck = renderXiaohongshuCards(SAMPLE);
    for (const id of Object.keys(SOCIAL_CARD_PRESETS)) {
      const html = deck.cards
        .map((card, i) => renderSocialCardHtml(card, { themeId: id, cardIndex: i, totalCards: deck.cards.length, footerBrand: '@测试' }))
        .join('\n');
      assert.ok(html.includes('width: 1242px') && html.includes('height: 1656px'));
      for (const cls of ['b-h2', 'b-p', 'b-li', 'b-q', 'b-code', 'b-table', 'b-fig', 'b-math']) assert.ok(html.includes(cls), `${id} misses ${cls}`);
      assert.ok(!/https?:\/\/(?!example\.com)/.test(html.replace(/xmlns="[^"]*"/g, '')), `${id} references a remote resource`);
      assert.ok(html.includes('@测试'));
      const n = deck.cards.length;
      assert.ok(html.includes(id === 'elegant-book' ? `— ${n} —` : `${n} / ${n}`));
    }
  });

  it('keeps footer page number and brand optional and caps image height', () => {
    const deck = renderXiaohongshuCards(SAMPLE);
    const imageCard = deck.cards.find((c) => c.blocks?.some((p) => p.block.kind === 'image'));
    assert.ok(imageCard);
    const html = renderSocialCardHtml(imageCard, { cardIndex: 2, totalCards: 5, showPageNumber: false });
    assert.ok(!html.includes('3 / 5'));
    assert.match(html, /<img [^>]*style="max-height:\d+px;"/);
  });

  it('measure page tags each block and approximates TeX offline', () => {
    const html = renderCardMeasureHtml([{ kind: 'paragraph', text: 'a' }, { kind: 'math', tex: 'a \\times b^2' }], getSocialCardTheme('blank'), 1000, 800);
    assert.ok(html.includes('data-b="0"') && html.includes('data-b="1"'));
    assert.equal(texToText('a \\times b^2 \\le \\frac{1}{2}'), 'a × b² ≤ (1)/(2)');
  });
});
