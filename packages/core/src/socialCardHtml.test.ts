import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cardRunningTitle, renderSocialCardHtml } from './socialCardHtml.ts';
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

describe('card running title (magazine masthead / book running head)', () => {
  it('drops a trailing bracketed note instead of cutting inside it', () => {
    assert.equal(cardRunningTitle('二、云端 CI 怎么执行？（图 3 · 流程总览）', 16), '二、云端 CI 怎么执行？');
  });
  it('ends a still-too-long title with an ellipsis and never inside an open bracket', () => {
    const t = cardRunningTitle('第三部分：如何在本地与云端同时运行端到端测试（Playwright + Electron）并汇总报告', 16);
    assert.equal([...t].length <= 16, true, t);
    assert.ok(t.endsWith('…'), t);
    assert.equal((t.match(/[（(]/g) ?? []).length, (t.match(/[）)]/g) ?? []).length, t);
  });
  it('strips inline markdown and keeps short titles as they are', () => {
    assert.equal(cardRunningTitle('**加粗**标题', 16), '加粗标题');
    assert.equal(cardRunningTitle('短标题（附注）', 16), '短标题（附注）');
  });
  it('is what the minimalist masthead shows', () => {
    const html = renderSocialCardHtml({ type: 'content', title: '二、云端 CI 怎么执行？（图 3 · 流程总览）', bodyLines: ['正文'] }, { themeId: 'minimalist-magazine', cardIndex: 1, totalCards: 3 });
    assert.match(html, /<span>二、云端 CI 怎么执行？<\/span>/);
  });
});
