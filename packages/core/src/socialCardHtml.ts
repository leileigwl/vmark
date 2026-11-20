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

/**
 * Formats inline markdown syntax (**bold**, ==highlight==, *italic*, ~~del~~, `code`)
 * matching xhs-textcard.site/editor's exact typography rules.
 */
export function formatInlineMarkdown(rawText: string, tokens: SocialCardTokens): string {
  const escaped = escapeHtml(rawText);
  return escaped
    .replace(
      /==([^=\n]+)==/g,
      `<mark style="background:${tokens.highlightBg};color:${tokens.accent};font-weight:700;padding:2px 8px;border-radius:6px;">$1</mark>`
    )
    .replace(
      /\*\*([^*\n]+)\*\*/g,
      `<strong style="font-weight:700;color:${tokens.ink};">$1</strong>`
    )
    .replace(
      /~~([^~\n]+)~~/g,
      `<del style="text-decoration:line-through;opacity:0.65;">$1</del>`
    )
    .replace(
      /`([^`\n]+)`/g,
      `<code style="background:rgba(128,128,128,0.12);padding:2px 8px;border-radius:6px;font-family:${tokens.fontCode};font-size:0.9em;">$1</code>`
    )
    .replace(/\*([^*\n]+)\*/g, `<em style="font-style:italic;opacity:0.92;">$1</em>`);
}

export interface RenderCardHtmlOptions {
  themeId?: string;
  cardIndex: number;
  totalCards: number;
  brandName?: string;
  aspectRatio?: PlatformCoverRatio;
  timestamp?: string;
}

function renderQuoteBlock(quoteHtml: string, tokens: SocialCardTokens): string {
  return `<div style="background:${tokens.quoteBg};border-left:6px solid ${tokens.lineStrong};border-radius:12px;padding:18px 24px;margin:8px 0 24px 0;font-style:italic;font-size:28px;line-height:1.68;color:${tokens.textSecondary};">${quoteHtml}</div>`;
}

function renderFlowingDocumentContent(
  card: XhsCardSection,
  tokens: SocialCardTokens,
  pageNumber: string,
  isLandscape: boolean
): string {
  if (card.type === 'code') {
    const maxLineLen = card.bodyLines.reduce((m, l) => Math.max(m, l.length), 0);
    const codeFontSize = maxLineLen > 54 ? 20 : maxLineLen > 44 ? 22 : 24;
    const boxBg = '#18181B';
    const boxInk = '#F4F4F5';
    const boxBorder = 'rgba(24,24,27,0.15)';

    const codeRows = card.bodyLines
      .map((line, idx) => {
        const lineNum = String(idx + 1).padStart(2, '0');
        return `<tr>
          <td style="color:#71717A;user-select:none;padding:3px 16px 3px 0;text-align:right;font-size:${codeFontSize - 2}px;font-family:${tokens.fontCode};border-right:1px solid rgba(255,255,255,0.12);width:44px;vertical-align:top;line-height:1.6;">${lineNum}</td>
          <td style="padding:3px 0 3px 18px;color:${boxInk};font-size:${codeFontSize}px;font-family:${tokens.fontCode};white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;line-height:1.6;vertical-align:top;">${escapeHtml(line)}</td>
        </tr>`;
      })
      .join('');

    return `
      <div style="display:flex;flex-direction:column;gap:22px;">
        <h2 style="font-size:44px;font-weight:800;line-height:1.3;color:${tokens.headingInk};font-family:${tokens.fontDisplay};margin:0;">${escapeHtml(card.title)}</h2>
        ${card.quote ? renderQuoteBlock(formatInlineMarkdown(card.quote, tokens), tokens) : ''}
        <div style="background:${boxBg};border:1.5px solid ${boxBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.14);">
          <div style="background:rgba(255,255,255,0.05);padding:14px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="display:flex;align-items:center;gap:9px;">
              <span style="width:13px;height:13px;border-radius:50%;background:${tokens.windowDotRed};display:inline-block;"></span>
              <span style="width:13px;height:13px;border-radius:50%;background:${tokens.windowDotYellow};display:inline-block;"></span>
              <span style="width:13px;height:13px;border-radius:50%;background:${tokens.windowDotGreen};display:inline-block;"></span>
            </div>
            <span style="font-size:17px;font-weight:700;color:#A1A1AA;font-family:${tokens.fontCode};text-transform:uppercase;">${escapeHtml(card.codeLang || 'typescript')}</span>
          </div>
          <div style="padding:24px 22px;">
            <table style="border-collapse:collapse;width:100%;">${codeRows}</table>
          </div>
        </div>
      </div>
    `;
  }

  const isFirstPage = card.type === 'cover';
  const titleFontSize = isLandscape ? '44px' : isFirstPage ? '56px' : '44px';
  const blocks: string[] = [
    `<h1 style="font-size:${titleFontSize};font-weight:800;line-height:1.3;color:${tokens.headingInk};font-family:${tokens.fontDisplay};margin:0 0 18px 0;letter-spacing:${tokens.letterSpacing};">${escapeHtml(card.title)}</h1>`,
  ];

  if (card.quote) {
    blocks.push(renderQuoteBlock(formatInlineMarkdown(card.quote, tokens), tokens));
  }

  if (isFirstPage && card.subtitle && !isLandscape) {
    blocks.push(
      `<h2 style="font-size:38px;font-weight:800;line-height:1.35;color:${tokens.headingInk};font-family:${tokens.fontDisplay};margin:10px 0 16px 0;">${escapeHtml(card.subtitle)}</h2>`
    );
  }

  const maxLines = isLandscape ? 2 : 6;
  for (const rawLine of card.bodyLines.slice(0, maxLines)) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('>')) {
      blocks.push(renderQuoteBlock(formatInlineMarkdown(trimmed.replace(/^>\s*/, ''), tokens), tokens));
      continue;
    }

    const isBullet = /^[•✦⚡🎯-]\s*/.test(trimmed);
    const numMatch = trimmed.match(/^(\d+\.)\s+(.+)$/);

    if (isBullet) {
      const cleanItem = trimmed.replace(/^[•✦⚡🎯-]\s*/, '');
      blocks.push(
        `<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:16px;font-size:30px;line-height:1.7;color:${tokens.ink};text-align:justify;"><span style="color:${tokens.accent};font-weight:700;flex-shrink:0;">•</span><div style="flex:1;overflow-wrap:break-word;">${formatInlineMarkdown(cleanItem, tokens)}</div></div>`
      );
    } else if (numMatch) {
      blocks.push(
        `<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:16px;font-size:30px;line-height:1.7;color:${tokens.ink};text-align:justify;"><span style="color:${tokens.accent};font-weight:700;flex-shrink:0;">${escapeHtml(numMatch[1])}</span><div style="flex:1;overflow-wrap:break-word;">${formatInlineMarkdown(numMatch[2], tokens)}</div></div>`
      );
    } else {
      blocks.push(
        `<p style="font-size:30px;line-height:1.72;color:${tokens.ink};margin:0 0 22px 0;text-align:justify;overflow-wrap:break-word;letter-spacing:${tokens.letterSpacing};">${formatInlineMarkdown(trimmed, tokens)}</p>`
      );
    }
  }

  if (card.closingQuote && !isLandscape) {
    blocks.push(renderQuoteBlock(formatInlineMarkdown(card.closingQuote, tokens), tokens));
  }

  if (isFirstPage && card.tags && card.tags.length > 0 && !card.closingQuote && card.bodyLines.length <= 3) {
    const tagPills = card.tags
      .slice(0, isLandscape ? 4 : 5)
      .map(
        (t) =>
          `<span style="color:${tokens.accent};background:${tokens.accentSurface};padding:5px 14px;border-radius:999px;font-size:21px;font-weight:600;display:inline-block;margin-right:10px;margin-bottom:8px;">#${escapeHtml(t)}</span>`
      )
      .join('');
    blocks.push(`<div style="margin-top:auto;padding-top:14px;">${tagPills}</div>`);
  }

  const hiddenTags = (card.tags || []).map((t) => `#${escapeHtml(t)}`).join(' ');
  blocks.push(`<!-- SECTION §${pageNumber} | HIGHLIGHTS / 本篇看点导览 | 3:4 FULL BLEED | PAGE ${pageNumber} | ${hiddenTags} -->`);

  return `<div style="flex:1;display:flex;flex-direction:column;">${blocks.join('\n')}</div>`;
}

/**
 * Renders a 1080x1440 (3:4), 1080x1620 (2:3), 1080x1920 (9:16), 1280x720 (16:9), or 1080x460 (2.35:1)
 * social card HTML string replicating xhs-textcard.site/editor's templates.
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
    timestamp = '11月21日 00:32',
  } = options;
  const spec = PLATFORM_COVER_SPECS[aspectRatio] || PLATFORM_COVER_SPECS['3:4'];
  const isLandscape = spec.width > spec.height;
  const genre: ContentGenre = card.genre || 'essay';
  const genreInfo = GENRE_META[genre];
  const pageNumber = String(cardIndex + 1).padStart(2, '0');
  const totalCount = String(totalCards).padStart(2, '0');
  const simplePageLabel = `${cardIndex + 1} / ${totalCards}`;
  const flowHtml = renderFlowingDocumentContent(card, tokens, pageNumber, isLandscape);

  let bodyBg = tokens.paper;
  let bodyPadding = isLandscape ? '36px 60px' : '78px 76px 64px 76px';
  let bodyExtraStyle = '';
  let innerHtml = '';

  if (tokens.chrome === 'ios-memo') {
    bodyPadding = isLandscape ? '20px 32px' : '0';
    innerHtml = `
      <div style="height:${isLandscape ? '64px' : '104px'};padding:0 54px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:8px;color:${tokens.accent};font-size:${isLandscape ? '26px' : '36px'};font-weight:500;">
          <svg width="22" height="36" viewBox="0 0 14 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.5 2.5L2.5 12L11.5 21.5" stroke="${tokens.accent}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>备忘录</span>
        </div>
        <div style="color:${tokens.textMuted};font-size:${isLandscape ? '20px' : '26px'};font-weight:500;">${escapeHtml(timestamp)}</div>
        <div style="color:${tokens.accent};font-size:${isLandscape ? '26px' : '36px'};font-weight:500;">完成</div>
      </div>
      <div class="ios-sheet" style="margin:0 32px;flex:1;background-color:${tokens.sheetBg};background-image:repeating-linear-gradient(to bottom,transparent 0px,transparent 50px,${tokens.ruledLineColor} 50px,${tokens.ruledLineColor} 51.5px);background-position:0 38px;border-radius:26px;box-shadow:0 10px 40px rgba(0,0,0,0.05);padding:${isLandscape ? '28px 44px' : '62px 66px'};display:flex;flex-direction:column;overflow:hidden;">
        ${flowHtml}
      </div>
      <div style="height:${isLandscape ? '44px' : '82px'};padding:0 54px;display:flex;align-items:center;justify-content:flex-end;color:rgba(142,142,147,0.65);font-size:25px;font-weight:500;flex-shrink:0;">
        <span>${simplePageLabel}</span>
      </div>`;
  } else if (tokens.chrome === 'minimalist-magazine') {
    bodyPadding = isLandscape ? '36px 64px' : '132px 96px 72px 96px';
    innerHtml = `
      <div class="mag-frame" style="flex:1;border-top:2px solid ${tokens.line};border-bottom:2px solid ${tokens.line};padding:${isLandscape ? '22px 0' : '40px 0'};display:flex;flex-direction:column;overflow:hidden;">
        ${flowHtml}
      </div>
      <div style="padding-top:22px;display:flex;justify-content:flex-end;color:rgba(153,153,153,0.75);font-size:25px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span>${simplePageLabel}</span>
      </div>`;
  } else if (tokens.chrome === 'elegant-book') {
    bodyBg = 'linear-gradient(135deg, #FDFBF7 0%, #F6F1E7 100%)';
    bodyPadding = isLandscape ? '36px 64px' : '128px 104px 78px 124px';
    bodyExtraStyle = 'box-shadow: inset 36px 0 54px -20px rgba(43, 35, 25, 0.08);';
    innerHtml = `
      <div class="book-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">${flowHtml}</div>
      <div style="padding-top:20px;display:flex;justify-content:flex-end;color:rgba(158,148,136,0.8);font-size:24px;"><span>${simplePageLabel}</span></div>`;
  } else {
    innerHtml = `
      <div class="blank-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">${flowHtml}</div>
      <div style="padding-top:16px;display:flex;justify-content:flex-end;color:rgba(153,153,153,0.65);font-size:25px;"><span>${simplePageLabel}</span></div>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(brandName)} - ${escapeHtml(tokens.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${spec.width}px;
      height: ${spec.height}px;
      overflow: hidden;
      background: ${bodyBg};
      ${bodyExtraStyle}
      font-family: ${tokens.fontBody};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: ${bodyPadding};
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body data-brand="${escapeHtml(brandName)}" data-page="${pageNumber} / ${totalCount}" data-footer="${escapeHtml(genreInfo.footerTag)}">
  ${innerHtml}
</body>
</html>`;
}
