import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import { CARD_CHROME_INSETS, SOCIAL_CARD_PRESETS, getCardContentBox, getSocialCardTheme } from './socialCardThemes.ts';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';
import { SAMPLE } from './socialCardSample.fixture.ts';

const NEW_TEMPLATES = [
  { id: 'grid-notebook', name: '方格手账', marker: 'class="box grid-paper"', extra: 'class="tape"' },
  { id: 'sticky-note', name: '便利贴', marker: 'class="box sticky-sheet"', extra: 'class="pin"' },
];

describe('two more card templates: 方格手账 and 便利贴', () => {
  it('are registered next to the existing five, each with its own chrome and content box', () => {
    assert.equal(Object.keys(SOCIAL_CARD_PRESETS).length, 7);
    for (const { id, name } of NEW_TEMPLATES) {
      const t = getSocialCardTheme(id);
      assert.equal(t.id, id);
      assert.equal(t.chrome, id);
      assert.ok(t.name.startsWith(name), t.name);
      assert.ok(CARD_CHROME_INSETS[t.chrome], `${id} has insets`);
      const box = getCardContentBox(id, '3:4');
      assert.ok(box.width > 900 && box.width < 1100 && box.height > 1200 && box.height < 1450, `${id} box ${box.width}×${box.height}`);
    }
  });

  it('render cover and content cards with their own decoration, page number and brand', () => {
    const deck = renderXiaohongshuCards(SAMPLE, { themeId: 'grid-notebook' });
    for (const { id, marker, extra } of NEW_TEMPLATES) {
      const n = deck.cards.length;
      const content = renderSocialCardHtml(deck.cards[1], { themeId: id, cardIndex: 1, totalCards: n, footerBrand: '@测试' });
      assert.ok(content.includes(`data-template="${id}"`));
      assert.ok(content.includes(marker), `${id} content box`);
      assert.ok(content.includes(extra), `${id} decoration`);
      assert.ok(content.includes(`2 / ${n}`) && content.includes('@测试'));
      const cover = renderSocialCardHtml(deck.cards[0], { themeId: id, cardIndex: 0, totalCards: n });
      assert.ok(cover.includes('class="cover'));
    }
  });
});
