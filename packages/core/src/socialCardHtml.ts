import type { XhsCardSection } from './xiaohongshuRenderer.ts';
import {
  GENRE_META,
  PLATFORM_COVER_SPECS,
  getSocialCardTheme,
  type ContentGenre,
  type PlatformCoverRatio,
  type SocialCardTokens,
} from './socialCardThemes.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderCardHtmlOptions {
  themeId?: string;
  cardIndex: number;
  totalCards: number;
  brandName?: string;
  aspectRatio?: PlatformCoverRatio;
  platformLabel?: string;
}

function renderCoverBody(
  card: XhsCardSection,
  tokens: SocialCardTokens,
  genre: ContentGenre,
  isLandscape: boolean
): string {
  const genreInfo = GENRE_META[genre];
  const kickerText = card.subtitle || `${genreInfo.badge} • ${genreInfo.kicker}`;
  const quoteText =
    card.quote ||
    card.bodyLines[0] ||
    '把每一次旅途、思考与创造，沉淀为经得起时间检验的个人作品。';
  const takeawayText =
    card.takeaway || `${genreInfo.badge}精选 • 左右滑动查看完整图文卡片`;

  const tagElements = (card.tags || genreInfo.defaultTags)
    .slice(0, isLandscape ? 5 : 7)
    .map(
      (t) =>
        `<span style="background:${tokens.accentSurface};color:${tokens.accentInk};padding:${isLandscape ? '6px 14px' : '10px 20px'};border-radius:999px;font-size:${isLandscape ? '18px' : '22px'};font-weight:600;display:inline-flex;align-items:center;border:1px solid ${tokens.line};">#${escapeHtml(t)}</span>`
    )
    .join('');

  if (isLandscape) {
    return `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:18px 0;gap:16px;">
        <div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <span style="display:inline-block;width:24px;height:3px;background:${tokens.accent};border-radius:2px;"></span>
            <span style="font-size:18px;font-weight:700;color:${tokens.accentInk};letter-spacing:2px;text-transform:uppercase;">${escapeHtml(kickerText)}</span>
          </div>
          <h1 style="font-size:46px;font-weight:700;line-height:1.22;color:${tokens.ink};letter-spacing:-0.02em;font-family:${tokens.fontDisplay};">${escapeHtml(card.title)}</h1>
        </div>
        <div style="background:${tokens.quoteBg};border-left:5px solid ${tokens.accent};border-radius:14px;padding:16px 22px;font-size:22px;line-height:1.5;color:${tokens.textSecondary};">
          “${escapeHtml(quoteText)}”
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          ${tagElements}
        </div>
      </div>
    `;
  }

  const highlightRows = card.bodyLines
    .slice(0, 4)
    .map((line, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const cleaned = line.replace(/^[•✦⚡🎯-]\s*/, '');
      return `
        <div style="display:flex;align-items:flex-start;gap:18px;padding:14px 0;${idx > 0 ? `border-top:1px dashed ${tokens.line};` : ''}">
          <span style="font-family:${tokens.fontCode};font-size:20px;font-weight:700;color:${tokens.accentInk};background:${tokens.accentSurface};padding:4px 12px;border-radius:8px;flex-shrink:0;margin-top:3px;">${num}</span>
          <div style="font-size:28px;line-height:1.48;color:${tokens.ink};font-weight:500;flex:1;">${escapeHtml(cleaned)}</div>
        </div>
      `;
    })
    .join('');

  const coverBannerMarkup = card.coverImage
    ? `<div style="background:${tokens.quoteBg};border:1.5px solid ${tokens.line};border-radius:18px;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;">
         <span style="font-size:20px;font-weight:600;color:${tokens.textSecondary};">🖼 已关联自定义封面图：${escapeHtml(card.coverImage)}</span>
         <span style="font-size:18px;font-family:${tokens.fontCode};color:${tokens.accentInk};">COVER READY</span>
       </div>`
    : '';

  return `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:20px 0;gap:18px;">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <span style="display:inline-block;width:34px;height:3.5px;background:${tokens.accent};border-radius:2px;"></span>
            <span style="font-size:22px;font-weight:700;color:${tokens.accentInk};letter-spacing:2.5px;text-transform:uppercase;">${escapeHtml(kickerText)}</span>
          </div>
          <span style="font-size:20px;font-weight:600;color:${tokens.textMuted};font-family:${tokens.fontCode};">UGC TEMPLATE • ${escapeHtml(genreInfo.badge)}</span>
        </div>

        <h1 style="font-size:62px;font-weight:700;line-height:1.22;color:${tokens.ink};letter-spacing:-0.02em;margin:0 0 20px 0;font-family:${tokens.fontDisplay};">${escapeHtml(card.title)}</h1>

        <div style="background:${tokens.quoteBg};border-left:6px solid ${tokens.accent};border-radius:18px;padding:20px 26px;border-top:1px solid ${tokens.line};border-right:1px solid ${tokens.line};border-bottom:1px solid ${tokens.line};">
          <div style="font-size:18px;font-weight:700;color:${tokens.accentInk};letter-spacing:1.5px;margin-bottom:6px;text-transform:uppercase;">EDITOR'S NOTE / 核心题记</div>
          <div style="font-size:26px;line-height:1.54;color:${tokens.textSecondary};font-weight:500;">“${escapeHtml(quoteText)}”</div>
        </div>
      </div>

      ${coverBannerMarkup}

      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;background:${tokens.cardBg};border:1.5px solid ${tokens.line};border-radius:26px;padding:24px 34px;box-shadow:0 12px 34px rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:1.5px solid ${tokens.line};">
          <span style="font-size:20px;font-weight:700;color:${tokens.textMuted};letter-spacing:1.5px;text-transform:uppercase;">HIGHLIGHTS / 本篇看点导览</span>
          <span style="font-size:18px;font-family:${tokens.fontCode};color:${tokens.accentInk};">01 — 0${Math.min(4, card.bodyLines.length)}</span>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:space-evenly;flex:1;">
          ${highlightRows}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:18px;">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
          ${tagElements}
        </div>
        <div style="background:${tokens.accentSurface};border:1px solid ${tokens.line};border-radius:16px;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:22px;font-weight:600;color:${tokens.accentInk};">✦ ${escapeHtml(takeawayText)}</span>
          <span style="font-size:19px;font-weight:700;color:${tokens.accent};font-family:${tokens.fontCode};">3:4 FULL BLEED</span>
        </div>
      </div>
    </div>
  `;
}

function renderCodeBody(
  card: XhsCardSection,
  tokens: SocialCardTokens,
  pageNumber: string
): string {
  const maxLineLen = card.bodyLines.reduce((m, l) => Math.max(m, l.length), 0);
  const codeFontSize = maxLineLen > 54 ? 20 : maxLineLen > 44 ? 22 : 24;

  const codeRows = card.bodyLines
    .map((line, idx) => {
      const lineNum = String(idx + 1).padStart(2, '0');
      return `<tr>
        <td style="color:${tokens.textMuted};user-select:none;padding:4px 18px 4px 0;text-align:right;font-size:${codeFontSize - 2}px;font-family:${tokens.fontCode};opacity:0.65;border-right:1px solid ${tokens.codeBorder};width:48px;vertical-align:top;line-height:1.6;">${lineNum}</td>
        <td style="padding:4px 0 4px 20px;color:${tokens.codeInk};font-size:${codeFontSize}px;font-family:${tokens.fontCode};white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;line-height:1.6;vertical-align:top;">${escapeHtml(line)}</td>
      </tr>`;
    })
    .join('');

  const takeawayText =
    card.takeaway || `代码片段 (${(card.codeLang || 'typescript').toUpperCase()}) • 纯本地离线渲染无损对齐`;

  return `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:28px 0;gap:24px;">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <span style="font-size:20px;font-weight:700;color:${tokens.accentInk};background:${tokens.accentSurface};padding:6px 16px;border-radius:999px;font-family:${tokens.fontCode};">SECTION §${pageNumber} • CODE SNAPSHOT</span>
          <span style="font-size:19px;font-family:${tokens.fontCode};color:${tokens.textMuted};">${card.bodyLines.length} LINES</span>
        </div>
        <h2 style="font-size:46px;font-weight:700;color:${tokens.ink};font-family:${tokens.fontDisplay};letter-spacing:-0.01em;line-height:1.25;">${escapeHtml(card.title)}</h2>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;background:${tokens.codeBg};border:1.5px solid ${tokens.codeBorder};border-radius:24px;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,0.2);">
        <div style="background:rgba(255,255,255,0.05);padding:18px 26px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${tokens.codeBorder};">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:14px;height:14px;border-radius:50%;background:${tokens.windowDotRed};display:inline-block;"></span>
            <span style="width:14px;height:14px;border-radius:50%;background:${tokens.windowDotYellow};display:inline-block;"></span>
            <span style="width:14px;height:14px;border-radius:50%;background:${tokens.windowDotGreen};display:inline-block;"></span>
            <span style="margin-left:10px;font-size:18px;color:${tokens.textSecondary};font-family:${tokens.fontCode};">vmark-snippet.${escapeHtml((card.codeLang || 'ts').toLowerCase())}</span>
          </div>
          <span style="font-size:18px;font-weight:700;color:${tokens.codeInk};font-family:${tokens.fontCode};letter-spacing:1px;text-transform:uppercase;background:rgba(255,255,255,0.08);padding:4px 12px;border-radius:6px;">${escapeHtml(card.codeLang || 'SNIPPET')}</span>
        </div>

        <div style="flex:1;display:flex;align-items:center;padding:30px 28px;overflow:hidden;">
          <table style="border-collapse:collapse;width:100%;">${codeRows}</table>
        </div>

        <div style="background:rgba(255,255,255,0.03);padding:14px 26px;border-top:1px solid ${tokens.codeBorder};display:flex;align-items:center;justify-content:space-between;font-family:${tokens.fontCode};font-size:17px;color:${tokens.textMuted};">
          <span>UTF-8 • Smart Wrap (No Broken Words)</span>
          <span>Ray.so × Vmark Engine</span>
        </div>
      </div>

      <div style="background:${tokens.quoteBg};border:1.5px solid ${tokens.line};border-left:6px solid ${tokens.accent};border-radius:18px;padding:20px 26px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:23px;font-weight:600;color:${tokens.ink};">💡 ${escapeHtml(takeawayText)}</div>
        <span style="font-size:18px;font-family:${tokens.fontCode};color:${tokens.accentInk};font-weight:700;">READY</span>
      </div>
    </div>
  `;
}

function renderContentBody(
  card: XhsCardSection,
  tokens: SocialCardTokens,
  pageNumber: string,
  genre: ContentGenre
): string {
  const genreInfo = GENRE_META[genre];
  const listItems = card.bodyLines
    .map((line, idx) => {
      const cleanText = line.replace(/^[•-]\s*/, '');
      const itemNum = String(idx + 1).padStart(2, '0');
      return `
        <div style="display:flex;align-items:flex-start;gap:20px;padding:22px 0;${idx > 0 ? `border-top:1px solid ${tokens.line};` : ''}">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;border-radius:12px;background:${tokens.accentSurface};color:${tokens.accentInk};font-family:${tokens.fontCode};font-size:20px;font-weight:700;flex-shrink:0;margin-top:4px;border:1px solid ${tokens.line};">${itemNum}</span>
          <div style="font-size:30px;line-height:1.62;color:${tokens.ink};font-family:${tokens.fontBody};flex:1;overflow-wrap:break-word;">${escapeHtml(cleanText)}</div>
        </div>
      `;
    })
    .join('');

  const quoteBlock = card.quote
    ? `<div style="background:${tokens.quoteBg};border-left:6px solid ${tokens.accent};border-radius:18px;padding:22px 26px;border-top:1px solid ${tokens.line};border-right:1px solid ${tokens.line};border-bottom:1px solid ${tokens.line};">
         <div style="font-size:25px;line-height:1.56;color:${tokens.textSecondary};font-weight:500;">“${escapeHtml(card.quote)}”</div>
       </div>`
    : '';

  const takeawayText =
    card.takeaway || `${card.title} • ${genreInfo.badge}核心笔记`;

  return `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:28px 0;gap:22px;">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <span style="font-size:20px;font-weight:700;color:${tokens.accentInk};background:${tokens.accentSurface};padding:6px 16px;border-radius:999px;font-family:${tokens.fontCode};">CHAPTER §${pageNumber} • ${escapeHtml(genreInfo.badge)}</span>
          <span style="font-size:19px;font-family:${tokens.fontCode};color:${tokens.textMuted};">${card.bodyLines.length} KEY POINTS</span>
        </div>
        <h2 style="font-size:48px;font-weight:700;color:${tokens.ink};font-family:${tokens.fontDisplay};letter-spacing:-0.015em;line-height:1.25;">${escapeHtml(card.title)}</h2>
      </div>

      ${quoteBlock}

      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-evenly;background:${tokens.cardBg};border:1.5px solid ${tokens.line};border-radius:26px;padding:28px 38px;box-shadow:0 12px 34px rgba(0,0,0,0.04);">
        ${listItems}
      </div>

      <div style="background:${tokens.accentSurface};border:1px solid ${tokens.line};border-radius:18px;padding:18px 26px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:22px;font-weight:600;color:${tokens.accentInk};">📌 ${escapeHtml(takeawayText.length > 42 ? `${takeawayText.slice(0, 41)}…` : takeawayText)}</span>
        <span style="font-size:18px;font-family:${tokens.fontCode};color:${tokens.accent};font-weight:700;">PAGE ${pageNumber}</span>
      </div>
    </div>
  `;
}

/**
 * Renders an editorial-grade social card HTML string.
 * Supports 3:4 (1080x1440 Xiaohongshu/Douyin), 9:16 (1080x1920), 16:9 (1280x720), and 2.35:1 (1080x460).
 */
export function renderSocialCardHtml(
  card: XhsCardSection,
  options: RenderCardHtmlOptions
): string {
  const tokens: SocialCardTokens = getSocialCardTheme(options.themeId);
  const {
    cardIndex,
    totalCards,
    brandName = 'Vmark Studio',
    aspectRatio = '3:4',
  } = options;
  const spec = PLATFORM_COVER_SPECS[aspectRatio] || PLATFORM_COVER_SPECS['3:4'];
  const isLandscape = spec.width > spec.height;
  const genre: ContentGenre = card.genre || 'essay';
  const genreInfo = GENRE_META[genre];
  const pageNumber = String(cardIndex + 1).padStart(2, '0');
  const totalCount = String(totalCards).padStart(2, '0');
  const isLast = cardIndex === totalCards - 1;

  let bodyMarkup = '';
  if (card.type === 'cover') {
    bodyMarkup = renderCoverBody(card, tokens, genre, isLandscape);
  } else if (card.type === 'code') {
    bodyMarkup = renderCodeBody(card, tokens, pageNumber);
  } else {
    bodyMarkup = renderContentBody(card, tokens, pageNumber, genre);
  }

  const footerAction = isLast ? 'End of Note • 欢迎收藏分享 ➔' : 'Swipe Next • 左滑继续阅读 ➔';
  const bodyPadding = isLandscape ? '36px 56px' : '52px 64px 52px 64px';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Vmark Editorial Card</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${spec.width}px;
      height: ${spec.height}px;
      overflow: hidden;
      background: ${tokens.paper};
      font-family: ${tokens.fontBody};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: ${bodyPadding};
      -webkit-font-smoothing: antialiased;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: ${isLandscape ? '14px' : '22px'};
      border-bottom: 1.5px solid ${tokens.line};
    }
    .header-brand {
      font-size: ${isLandscape ? '18px' : '22px'};
      font-weight: 800;
      color: ${tokens.ink};
      letter-spacing: 2px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${tokens.accent};
      display: inline-block;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-genre {
      font-size: ${isLandscape ? '16px' : '19px'};
      font-weight: 600;
      color: ${tokens.textSecondary};
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid ${tokens.line};
      background: ${tokens.cardBg};
    }
    .header-badge {
      font-size: ${isLandscape ? '17px' : '20px'};
      font-weight: 700;
      color: ${tokens.accentInk};
      font-family: ${tokens.fontCode};
      background: ${tokens.accentSurface};
      padding: 6px 18px;
      border-radius: 999px;
      border: 1px solid ${tokens.line};
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: ${isLandscape ? '14px' : '22px'};
      border-top: 1.5px solid ${tokens.line};
    }
    .footer-note {
      font-size: ${isLandscape ? '16px' : '20px'};
      font-weight: 500;
      color: ${tokens.textMuted};
      letter-spacing: 0.4px;
    }
    .footer-nav {
      font-size: ${isLandscape ? '16px' : '20px'};
      font-weight: 700;
      color: ${tokens.accent};
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-brand">
      <span class="header-dot"></span>
      <span>${escapeHtml(brandName)}</span>
    </div>
    <div class="header-right">
      <span class="header-genre">${escapeHtml(genreInfo.badge)} · ${escapeHtml(aspectRatio)}</span>
      <div class="header-badge">${pageNumber} / ${totalCount}</div>
    </div>
  </div>

  ${bodyMarkup}

  <div class="footer">
    <div class="footer-note">${escapeHtml(genreInfo.footerTag)}</div>
    <div class="footer-nav">${footerAction}</div>
  </div>
</body>
</html>`;
}
