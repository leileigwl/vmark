import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_COVER_SPECS,
  SOCIAL_CARD_PRESETS,
  getSocialCardTheme,
} from './socialCardThemes.ts';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import {
  detectArticleGenre,
  renderXiaohongshuCards,
  type XhsCardSection,
} from './xiaohongshuRenderer.ts';

describe('Multi-Genre Full-Bleed Social Card & Cover Adaptation Engine', () => {
  it('provides all 5 master design presets and resolves legacy aliases', () => {
    assert.ok(SOCIAL_CARD_PRESETS['editorial-coral']);
    assert.ok(SOCIAL_CARD_PRESETS['ink-classic']);
    assert.ok(SOCIAL_CARD_PRESETS['forest-journal']);
    assert.ok(SOCIAL_CARD_PRESETS['swiss-slate']);
    assert.ok(SOCIAL_CARD_PRESETS['ray-dark']);

    assert.equal(getSocialCardTheme('geek-dark').id, 'ray-dark');
    assert.equal(getSocialCardTheme('warm-note').id, 'editorial-coral');
    assert.equal(getSocialCardTheme('modern-minimal').id, 'ink-classic');
    assert.equal(getSocialCardTheme('academic-blue').id, 'swiss-slate');
    assert.equal(getSocialCardTheme('travel-forest').id, 'forest-journal');
    assert.equal(getSocialCardTheme('unknown-fallback').id, 'editorial-coral');
  });

  it('auto-detects travel diaries, personal essays, reading notes, and tech articles without hardcoded tech pollution', () => {
    const travelMd = `---
title: 京都深秋漫游手记：4条山野古寺步径
tags: [旅行日记, 京都漫游]
---
> 真正的旅行是在陌生街角找到属于自己的清晨节奏。

## 岚山奥嵯峨的清晨苔庭
- 祇王寺与常寂光寺连走，阳光穿过枫林
- 化野念佛寺竹径散步与街角手冲咖啡
`;
    const travelDeck = renderXiaohongshuCards(travelMd);
    assert.equal(travelDeck.genre, 'travel');
    assert.equal(travelDeck.coverTemplate, 'travel-postcard');
    assert.ok(travelDeck.tags.includes('旅行日记'));
    assert.ok(!travelDeck.tags.includes('前端开发'));
    assert.equal(travelDeck.cards[0].quote, '真正的旅行是在陌生街角找到属于自己的清晨节奏。');

    const essayMd = `# 周末独处随笔：慢下来生活\n\n在喧嚣日常里保留一段不被打扰的午后时光。\n\n## 记录生活的微光\n- 泡一壶热茶整理本周思绪`;
    const essayDeck = renderXiaohongshuCards(essayMd);
    assert.equal(essayDeck.genre, 'essay');
    assert.ok(essayDeck.tags.includes('个人随笔'));
    assert.ok(!essayDeck.tags.includes('前端开发'));

    assert.equal(detectArticleGenre('深入理解 TypeScript 编译器架构', '架构笔记'), 'tech');
    assert.equal(detectArticleGenre('本周读完《沉思录》的三点摘抄', '读书笔记'), 'reading');
  });

  it('renders 3:4 full-bleed cover card and adapts to 16:9 / 2.35:1 / 9:16 platform cover ratios', () => {
    const card: XhsCardSection = {
      type: 'cover',
      title: '京都深秋漫游手记：避开人潮的山野步径',
      subtitle: '旅行手记 • TRAVEL & LIFESTYLE LOG',
      quote: '真正的旅行不是打卡，而是在陌生街角找到清晨节奏。',
      bodyLines: ['岚山奥嵯峨：清晨七点的苔庭与竹影', '哲学之道至南禅寺：水路阁下的阅读时刻'],
      tags: ['旅行日记', '京都漫游', '城市步径'],
      genre: 'travel',
    };

    const html34 = renderSocialCardHtml(card, {
      themeId: 'editorial-coral',
      cardIndex: 0,
      totalCards: 5,
      brandName: 'Vmark Studio',
      aspectRatio: '3:4',
    });

    assert.ok(html34.includes('width: 1080px'));
    assert.ok(html34.includes('height: 1440px'));
    assert.ok(html34.includes('HIGHLIGHTS / 本篇看点导览'));
    assert.ok(html34.includes('3:4 FULL BLEED'));
    assert.ok(html34.includes('#旅行日记'));
    assert.ok(html34.includes('Travel &amp; City Walk Journal'));

    const html169 = renderSocialCardHtml(card, {
      themeId: 'ink-classic',
      cardIndex: 0,
      totalCards: 3,
      aspectRatio: '16:9',
    });
    assert.ok(html169.includes(`width: ${PLATFORM_COVER_SPECS['16:9'].width}px`));
    assert.ok(html169.includes(`height: ${PLATFORM_COVER_SPECS['16:9'].height}px`));

    const htmlWeixin = renderSocialCardHtml(card, {
      themeId: 'editorial-coral',
      cardIndex: 0,
      totalCards: 3,
      aspectRatio: '2.35:1',
    });
    assert.ok(htmlWeixin.includes('width: 1080px'));
    assert.ok(htmlWeixin.includes('height: 460px'));
  });

  it('renders Ray.so code window without word-break:break-all word splitting and aligns line numbers to top', () => {
    const card: XhsCardSection = {
      type: 'code',
      title: '高吞吐流水线实现',
      bodyLines: [
        'export async function dispatchSocialCard(task: ArticlePublishTask) {',
        '  const rasterized = await rasterizeCards(task.markdown);',
        '  return uploadBatch(rasterized.imagePaths);',
        '}',
      ],
      codeLang: 'typescript',
      genre: 'tech',
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'ray-dark',
      cardIndex: 2,
      totalCards: 5,
    });

    assert.ok(html.includes('03 / 05'));
    assert.ok(html.includes('typescript'));
    assert.ok(html.includes('#ff5f56'));
    assert.ok(html.includes('word-break:normal'));
    assert.ok(html.includes('overflow-wrap:break-word'));
    assert.ok(html.includes('vertical-align:top'));
    assert.ok(!html.includes('word-break:break-all'));
  });

  it('renders full-bleed content card with numbered items, pull quote, and takeaway bar', () => {
    const card: XhsCardSection = {
      type: 'content',
      title: '岚山奥嵯峨：清晨七点的苔庭与竹影',
      quote: '整条碎石路只有落叶与鸟鸣。',
      bodyLines: [
        '• 祇王寺与常寂光寺连走：早晨8点开门即入',
        '• 爱宕念佛寺千尊石佛：藏在山谷深处极少游客抵达',
        '• 化野念佛寺竹径：适合带一本随笔在茶席小坐',
      ],
      genre: 'travel',
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'forest-journal',
      cardIndex: 1,
      totalCards: 4,
    });

    assert.ok(html.includes('02 / 04'));
    assert.ok(html.includes('CHAPTER §02'));
    assert.ok(html.includes('岚山奥嵯峨：清晨七点的苔庭与竹影'));
    assert.ok(html.includes('整条碎石路只有落叶与鸟鸣'));
    assert.ok(html.includes('PAGE 02'));
  });
});
