import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_COVER_SPECS,
  SOCIAL_CARD_PRESETS,
  getSocialCardTheme,
} from './socialCardThemes.ts';
import { formatInlineMarkdown, renderSocialCardHtml } from './socialCardHtml.ts';
import {
  detectArticleGenre,
  renderXiaohongshuCards,
  type XhsCardSection,
} from './xiaohongshuRenderer.ts';

describe('xhs-textcard Style Social Card Engine (Apple Notes, Minimalist Magazine, Blank, Book)', () => {
  it('provides all 4 clean light xhs-textcard master templates and resolves legacy aliases', () => {
    assert.ok(SOCIAL_CARD_PRESETS['ios-memo']);
    assert.ok(SOCIAL_CARD_PRESETS['minimalist-magazine']);
    assert.ok(SOCIAL_CARD_PRESETS['blank']);
    assert.ok(SOCIAL_CARD_PRESETS['elegant-book']);
    assert.equal(SOCIAL_CARD_PRESETS['deep-night'], undefined);

    assert.equal(getSocialCardTheme('ios-memo').id, 'ios-memo');
    assert.equal(getSocialCardTheme('minimalist-magazine').id, 'minimalist-magazine');
    assert.equal(getSocialCardTheme('blank').id, 'blank');
    assert.equal(getSocialCardTheme('elegant-book').id, 'elegant-book');
    assert.equal(getSocialCardTheme('forest-journal').id, 'elegant-book');
    assert.equal(getSocialCardTheme('editorial-coral').id, 'ios-memo');
    assert.equal(getSocialCardTheme('ink-classic').id, 'minimalist-magazine');
    assert.equal(getSocialCardTheme('unknown-fallback').id, 'ios-memo');
  });

  it('formats inline **bold**, ==highlight==, *italic*, ~~del~~, and `code` accurately', () => {
    const tokens = getSocialCardTheme('ios-memo');
    const formatted = formatInlineMarkdown(
      '这是**加粗**与==关键高亮==以及*斜体*、~~删除线~~和`safeStorage`代码。',
      tokens
    );
    assert.ok(formatted.includes('<strong style="font-weight:700;color:#1C1C1E;">加粗</strong>'));
    assert.ok(
      formatted.includes(
        '<mark style="background:rgba(255, 149, 0, 0.16);color:#FF9500;font-weight:700;padding:2px 8px;border-radius:6px;">关键高亮</mark>'
      )
    );
    assert.ok(formatted.includes('<em style="font-style:italic;opacity:0.92;">斜体</em>'));
    assert.ok(formatted.includes('<del style="text-decoration:line-through;opacity:0.65;">删除线</del>'));
    assert.ok(formatted.includes('<code '));
  });

  it('auto-detects travel diaries, personal essays, reading notes, and tech articles without hardcoded tech pollution', () => {
    const travelMd = `---
title: 京都深秋漫游手记：4条山野古寺步径
tags: [旅行日记, 京都漫游]
---
> 真正的旅行是在陌生街角找到属于自己的清晨节奏。

## 岚山奥嵯峨的清晨苔庭
- 祇王寺与常寂光寺连走，==阳光穿过枫林==
- 化野念佛寺竹径散步与**街角手冲咖啡**
`;
    const travelDeck = renderXiaohongshuCards(travelMd);
    assert.equal(travelDeck.genre, 'travel');
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

  it('renders ios-memo (苹果备忘录), minimalist-magazine (极简杂志), and blank (空白模板) across 3:4, 2:3, 16:9, and 2.35:1 ratios', () => {
    const card: XhsCardSection = {
      type: 'cover',
      title: '京都深秋漫游手记：避开人潮的山野步径',
      subtitle: '慢下来如何组织一篇漫游随笔',
      quote: '真正的旅行不是打卡，而是在陌生街角找到清晨节奏。',
      bodyLines: [
        '每一段保持短一点，两个回车分隔段落。所以**清晰分段**比手动塞满一页更稳定。',
        '==高亮==适合真正需要停顿的关键信息，一眼抓住视线。',
      ],
      closingQuote: '引用适合一句完整的旅途总结，把落叶与鸟鸣定格在纸页底部。',
      tags: ['旅行日记', '京都漫游', '城市步径'],
      genre: 'travel',
    };

    const htmlMemo = renderSocialCardHtml(card, {
      themeId: 'ios-memo',
      cardIndex: 0,
      totalCards: 5,
      brandName: 'Vmark Notes',
      aspectRatio: '3:4',
    });

    assert.ok(htmlMemo.includes('width: 1080px'));
    assert.ok(htmlMemo.includes('height: 1440px'));
    assert.ok(htmlMemo.includes('备忘录'));
    assert.ok(htmlMemo.includes('完成'));
    assert.ok(htmlMemo.includes('repeating-linear-gradient'));
    assert.ok(htmlMemo.includes('#FF9500'));
    assert.ok(htmlMemo.includes('1 / 5'));

    const htmlMag = renderSocialCardHtml(card, {
      themeId: 'minimalist-magazine',
      cardIndex: 0,
      totalCards: 4,
      aspectRatio: '2:3',
    });
    assert.ok(htmlMag.includes(`width: ${PLATFORM_COVER_SPECS['2:3'].width}px`));
    assert.ok(htmlMag.includes(`height: ${PLATFORM_COVER_SPECS['2:3'].height}px`));
    assert.ok(htmlMag.includes('#8C3A3A'));
    assert.ok(htmlMag.includes('mag-frame'));

    const htmlBlank = renderSocialCardHtml(card, {
      themeId: 'blank',
      cardIndex: 0,
      totalCards: 3,
      aspectRatio: '3:4',
    });
    assert.ok(htmlBlank.includes('blank-content'));
    assert.ok(htmlBlank.includes('#8A8A8A'));
    assert.ok(htmlBlank.includes('1 / 3'));
  });

  it('renders code window without word-break:break-all word splitting and aligns line numbers to top', () => {
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
      themeId: 'minimalist-magazine',
      cardIndex: 2,
      totalCards: 5,
    });

    assert.ok(html.includes('3 / 5'));
    assert.ok(html.includes('typescript'));
    assert.ok(html.includes('#ff5f56'));
    assert.ok(html.includes('word-break:normal'));
    assert.ok(html.includes('overflow-wrap:break-word'));
    assert.ok(html.includes('vertical-align:top'));
    assert.ok(!html.includes('word-break:break-all'));
  });

  it('converts Markdown tables to structured bullets, strips --- rules, and avoids duplicate pre-heading cards', () => {
    const md = [
      '# 深入解析现代前端富文本与 AST 渲染管线',
      '',
      '> 本文介绍的 AST 转换引擎遵循单向不可逆只读渲染原则。',
      '',
      '现代技术创作者通常面临严峻的内容分发割裂困境：需要适配多个异构平台。',
      '',
      '---',
      '',
      '## 1. 异构平台分发的核心差异矩阵',
      '',
      '下表总结了主流平台的解析特性：',
      '',
      '| 平台属性 | 微信公众号 | 知乎专栏 |',
      '| :--- | :--- | :--- |',
      '| **图片防盗链** | 严格白名单 (mmbiz.qpic.cn) | 自动转存 (picx.zhimg.com) |',
      '| **超链接交互** | 仅支持文末附录与脚注 | 原生可点击 |',
      '',
      '---',
    ].join('\n');

    const deck = renderXiaohongshuCards(md);
    const allLines = deck.cards.flatMap((c) => c.bodyLines);

    assert.equal(deck.cards[0].type, 'cover');
    assert.equal(deck.cards[1].title, '1. 异构平台分发的核心差异矩阵');
    assert.ok(deck.cards.filter((c) => c.title === '1. 异构平台分发的核心差异矩阵').length === 1);
    assert.ok(!allLines.some((line) => line.includes('| :--- |') || line.trim() === '---'));
    assert.ok(
      allLines.some(
        (line) =>
          line.includes('**图片防盗链**') &&
          line.includes('微信公众号：严格白名单') &&
          line.includes('知乎专栏：自动转存')
      )
    );
  });
});
