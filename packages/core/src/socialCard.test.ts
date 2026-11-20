import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SOCIAL_CARD_THEMES, getSocialCardTheme } from './socialCardThemes.ts';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import type { XhsCardSection } from './xiaohongshuRenderer.ts';

describe('Social Card Generator Core', () => {
  it('provides all 4 distinct classic themes', () => {
    assert.ok(SOCIAL_CARD_THEMES['geek-dark']);
    assert.ok(SOCIAL_CARD_THEMES['warm-note']);
    assert.ok(SOCIAL_CARD_THEMES['modern-minimal']);
    assert.ok(SOCIAL_CARD_THEMES['academic-blue']);
    assert.equal(getSocialCardTheme('non-existent').id, 'geek-dark');
  });

  it('renders cover card html with escaping and proper tags', () => {
    const card: XhsCardSection = {
      type: 'cover',
      title: '深度解析 <React 19> 核心特性',
      subtitle: '前端架构指南',
      bodyLines: ['⚡️ 纯本地 Markdown 渲染', '🎯 全平台自适应高保真排版'],
      tags: ['React', '前端开发'],
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'warm-note',
      cardIndex: 0,
      totalCards: 5,
      brandName: 'Vmark Tech',
    });

    assert.ok(html.includes('1080px'));
    assert.ok(html.includes('1440px'));
    assert.ok(html.includes('&lt;React 19&gt;'));
    assert.ok(!html.includes('<React 19>'));
    assert.ok(html.includes('01 / 05'));
    assert.ok(html.includes('#React'));
    assert.ok(html.includes('Vmark Tech'));
  });

  it('renders code card with syntax window buttons and line numbers', () => {
    const card: XhsCardSection = {
      type: 'code',
      title: '代码实现示例',
      bodyLines: ['const sum = (a, b) => a + b;', 'console.log(sum(1, 2));'],
      codeLang: 'typescript',
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'geek-dark',
      cardIndex: 2,
      totalCards: 5,
    });

    assert.ok(html.includes('03 / 05'));
    assert.ok(html.includes('typescript'));
    assert.ok(html.includes('#ff5f56')); // Mac red button
    assert.ok(html.includes('const sum = (a, b) =&gt; a + b;'));
  });

  it('renders content card with bullet lists', () => {
    const card: XhsCardSection = {
      type: 'content',
      title: '三大核心优势',
      bodyLines: ['• 本地优先架构设计', '• 离屏无头高清光栅化', '• 零外链零泄漏'],
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'modern-minimal',
      cardIndex: 1,
      totalCards: 3,
    });

    assert.ok(html.includes('02 / 03'));
    assert.ok(html.includes('三大核心优势'));
    assert.ok(html.includes('本地优先架构设计'));
  });
});
