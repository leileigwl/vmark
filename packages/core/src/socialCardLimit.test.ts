import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';

const LONG = [
  '# 超长文章',
  '',
  ...Array.from({ length: 60 }, (_, i) => `## 第 ${i + 1} 节\n\n${'这一节用很多句子来填满卡片，确保排版器会生成足够多的页面。'.repeat(6)}\n`),
].join('\n');

describe('card limit is reported, never silent', () => {
  it('keeps 18 cards by default and reports how many were dropped', () => {
    const deck = renderXiaohongshuCards(LONG, { fallbackTitle: 't' });
    assert.equal(deck.cards.length, 18);
    assert.ok(deck.totalCards > 18, `expected a deck longer than 18, got ${deck.totalCards}`);
    assert.equal(deck.droppedCards, deck.totalCards - 18);
  });

  it('honours the platform limit passed in (e.g. 抖音 35)', () => {
    const deck = renderXiaohongshuCards(LONG, { fallbackTitle: 't', maxCards: 35 });
    assert.equal(deck.cards.length, Math.min(35, deck.totalCards));
    assert.equal(deck.droppedCards, Math.max(0, deck.totalCards - 35));
  });

  it('reports zero dropped for a short article', () => {
    const deck = renderXiaohongshuCards('# 短文\n\n一段话。', { fallbackTitle: 't' });
    assert.equal(deck.droppedCards, 0);
    assert.equal(deck.totalCards, deck.cards.length);
  });
});
