import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SOCIAL_CARD_PRESETS, getSocialCardTheme } from './socialCardThemes.ts';
import { renderSocialCardHtml } from './socialCardHtml.ts';
import type { XhsCardSection } from './xiaohongshuRenderer.ts';

describe('Guizang Editorial x Ray.so Social Card Engine', () => {
  it('provides all 4 master design presets with WCAG-calibrated tokens', () => {
    assert.ok(SOCIAL_CARD_PRESETS['ink-classic']);
    assert.ok(SOCIAL_CARD_PRESETS['swiss-slate']);
    assert.ok(SOCIAL_CARD_PRESETS['ray-dark']);
    assert.ok(SOCIAL_CARD_PRESETS['editorial-coral']);

    // Check alias resolution for smooth backwards compatibility
    assert.equal(getSocialCardTheme('geek-dark').id, 'ray-dark');
    assert.equal(getSocialCardTheme('warm-note').id, 'editorial-coral');
    assert.equal(getSocialCardTheme('modern-minimal').id, 'ink-classic');
    assert.equal(getSocialCardTheme('academic-blue').id, 'swiss-slate');
    assert.equal(getSocialCardTheme('unknown-fallback').id, 'ray-dark');
  });

  it('renders Guizang Editorial cover card with kicker, lead and safe tags', () => {
    const card: XhsCardSection = {
      type: 'cover',
      title: '从架构哲学到工程落地：深入解析 Vmark 本地优先设计',
      subtitle: 'EDITORIAL NOTE',
      bodyLines: ['⚡️ 纯本地 Markdown 一键生成', '🎯 全平台自适应高保真排版', '🛡 敏感凭据系统级安全加密'],
      tags: ['软件工程', '前端架构', '本地优先'],
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'ink-classic',
      cardIndex: 0,
      totalCards: 4,
      brandName: 'Vmark Studio',
    });

    assert.ok(html.includes('1080px'));
    assert.ok(html.includes('1440px'));
    assert.ok(html.includes('EDITORIAL NOTE'));
    assert.ok(html.includes('01 / 04'));
    assert.ok(html.includes('Vmark Studio'));
    assert.ok(html.includes('#软件工程'));
    assert.ok(html.includes('Guizang Editorial × Ray.so Design'));
  });

  it('renders Ray.so code window with traffic lights, line numbers, and language badge', () => {
    const card: XhsCardSection = {
      type: 'code',
      title: '高吞吐流水线实现',
      bodyLines: [
        'export async function dispatchDraft(task: PublishTask) {',
        '  const rasterized = await rasterizeCards(task.markdown);',
        '  return uploadBatch(rasterized.imagePaths);',
        '}',
      ],
      codeLang: 'typescript',
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'ray-dark',
      cardIndex: 2,
      totalCards: 5,
    });

    assert.ok(html.includes('03 / 05'));
    assert.ok(html.includes('typescript'));
    assert.ok(html.includes('#ff5f56')); // Mac Red
    assert.ok(html.includes('#ffbd2e')); // Mac Yellow
    assert.ok(html.includes('#27c93f')); // Mac Green
    assert.ok(html.includes('rasterizeCards'));
  });

  it('renders Guizang One-Idea content card with chapter section indicator', () => {
    const card: XhsCardSection = {
      type: 'content',
      title: '三大不可妥协的安全准则',
      bodyLines: [
        '• 凭证零外泄：全加密隔离落库',
        '• 离屏无痕光栅化：100% 纯本地离线捕获',
        '• 频控反风控：平滑节奏上传保护账号健康',
      ],
    };

    const html = renderSocialCardHtml(card, {
      themeId: 'swiss-slate',
      cardIndex: 1,
      totalCards: 3,
    });

    assert.ok(html.includes('02 / 03'));
    assert.ok(html.includes('§02'));
    assert.ok(html.includes('三大不可妥协的安全准则'));
    assert.ok(html.includes('频控反风控'));
  });
});
