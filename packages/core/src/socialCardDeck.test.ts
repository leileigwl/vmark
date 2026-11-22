import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderXiaohongshuCards } from './xiaohongshuRenderer.ts';
import { SAMPLE } from './socialCardSample.fixture.ts';

describe('xiaohongshu deck flows content across cards', () => {
  it('does not leave a near-empty card when many short sections follow each other (old per-heading split)', () => {
    const md = Array.from({ length: 8 }, (_, i) => `## 第${i + 1}点\n\n这是一行很短的说明文字。`).join('\n\n');
    const deck = renderXiaohongshuCards(`# 八个小技巧\n\n${md}`);
    const content = deck.cards.filter((c) => c.type !== 'cover');
    assert.ok(content.length <= 2, `expected ≤2 content cards, got ${content.length}`);
    content.slice(0, -1).forEach((c) => assert.ok((c.fill ?? 0) >= 0.5));
  });

  it('builds a deck whose content cards respect fill and heading rules', () => {
    const deck = renderXiaohongshuCards(SAMPLE.repeat(2));
    const content = deck.cards.filter((c) => c.type !== 'cover');
    assert.ok(content.length >= 2);
    content.slice(0, -1).forEach((c, i) => {
      assert.ok((c.fill ?? 0) >= 0.5, `card ${i + 2} fill ${c.fill}`);
      const blocks = c.blocks ?? [];
      assert.notEqual(blocks[blocks.length - 1]?.block.kind, 'heading');
    });
  });
});


describe('caption excludes table text', () => {
  it('xiaohongshu caption skips table cells and code', () => {
    const deck = renderXiaohongshuCards(SAMPLE);
    assert.ok(deck.captionText.includes('三年前我开始认真整理'));
    assert.ok(!deck.captionText.includes('必须今天完成的事'));
    assert.ok(!deck.captionText.includes('weekly_review'));
    assert.ok(deck.captionText.includes('#效率'));
  });
});
