import type { XhsCardSection } from './xiaohongshuRenderer.ts';
import { getSocialCardTheme, type SocialCardTokens } from './socialCardThemes.ts';

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
}

/**
 * Renders an editorial-grade 3:4 (1080x1440) social card HTML string.
 * Strictly implements Guizang Editorial x Swiss system & Ray.so code window styling.
 */
export function renderSocialCardHtml(
  card: XhsCardSection,
  options: RenderCardHtmlOptions
): string {
  const tokens: SocialCardTokens = getSocialCardTheme(options.themeId);
  const { cardIndex, totalCards, brandName = 'Vmark' } = options;
  const pageNumber = String(cardIndex + 1).padStart(2, '0');
  const totalCount = String(totalCards).padStart(2, '0');
  const isFirst = cardIndex === 0;
  const isLast = cardIndex === totalCards - 1;

  let bodyMarkup = '';

  if (card.type === 'cover') {
    // Editorial Cover: Kicker + Big Title + Lead + Feature Strip / Tags
    const kickerText = card.subtitle || tokens.kicker;
    const tagElements = (card.tags || [])
      .map(
        (t) =>
          `<span style="background:${tokens.accentSurface};color:${tokens.accentInk};padding:8px 18px;border-radius:999px;font-size:22px;font-weight:600;display:inline-flex;align-items:center;gap:6px;margin-right:12px;margin-bottom:12px;border:1px solid ${tokens.line};">#${escapeHtml(t)}</span>`
      )
      .join('');

    const leadElements = card.bodyLines
      .slice(0, 3)
      .map(
        (line) =>
          `<div style="font-size:30px;line-height:1.6;color:${tokens.textSecondary};margin-bottom:14px;font-family:${tokens.fontBody};">✦ ${escapeHtml(line)}</div>`
      )
      .join('');

    bodyMarkup = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:40px 0;">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px;">
          <span style="display:inline-block;width:28px;height:2.5px;background:${tokens.lineStrong};"></span>
          <span style="font-size:22px;font-weight:700;color:${tokens.accentInk};letter-spacing:3px;text-transform:uppercase;">${escapeHtml(kickerText)}</span>
        </div>

        <h1 style="font-size:62px;font-weight:600;line-height:1.24;color:${tokens.ink};letter-spacing:-0.02em;margin:0 0 36px 0;font-family:${tokens.fontDisplay};">${escapeHtml(card.title)}</h1>

        <div style="background:${tokens.cardBg};border:1.5px solid ${tokens.line};border-radius:24px;padding:36px;margin-bottom:36px;box-shadow:0 8px 30px rgba(0,0,0,0.04);">
          ${leadElements}
        </div>

        <div style="display:flex;flex-wrap:wrap;align-items:center;">
          ${tagElements}
        </div>
      </div>
    `;
  } else if (card.type === 'code') {
    // Ray.so inspired Code Window: macOS Traffic Lights + High Contrast Code Grid
    const codeRows = card.bodyLines
      .map((line, idx) => {
        const lineNum = String(idx + 1).padStart(2, '0');
        return `<tr>
          <td style="color:${tokens.textMuted};user-select:none;padding-right:20px;text-align:right;font-size:22px;font-family:${tokens.fontCode};opacity:0.5;border-right:1px solid ${tokens.line};width:48px;">${lineNum}</td>
          <td style="padding-left:20px;color:${tokens.codeInk};font-size:24px;font-family:${tokens.fontCode};white-space:pre-wrap;word-break:break-all;line-height:1.54;">${escapeHtml(line)}</td>
        </tr>`;
      })
      .join('');

    bodyMarkup = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px 0;">
        <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:${tokens.accent};font-family:${tokens.fontCode};">§${pageNumber}</span>
          <h2 style="font-size:42px;font-weight:600;color:${tokens.ink};font-family:${tokens.fontDisplay};letter-spacing:-0.01em;margin:0;">${escapeHtml(card.title)}</h2>
        </div>

        <div style="background:${tokens.codeBg};border:1.5px solid ${tokens.codeBorder};border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.18);">
          <div style="background:rgba(255,255,255,0.04);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${tokens.codeBorder};">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:14px;height:14px;border-radius:50%;background:${tokens.windowDotRed};display:inline-block;"></span>
              <span style="width:14px;height:14px;border-radius:50%;background:${tokens.windowDotYellow};display:inline-block;"></span>
              <span style="width:14px;height:14px;border-radius:50%;background:${tokens.windowDotGreen};display:inline-block;"></span>
            </div>
            <span style="font-size:18px;font-weight:700;color:${tokens.textSecondary};font-family:${tokens.fontCode};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(card.codeLang || 'SNIPPET')}</span>
          </div>
          <div style="padding:28px 24px;overflow:hidden;">
            <table style="border-collapse:collapse;width:100%;">${codeRows}</table>
          </div>
        </div>
      </div>
    `;
  } else {
    // Guizang Editorial One-Idea Content Card
    const listItems = card.bodyLines
      .map((line) => {
        const isBullet = line.startsWith('•') || line.startsWith('-');
        const cleanText = line.replace(/^[•-]\s*/, '');
        return `
          <div style="display:flex;align-items:flex-start;gap:18px;margin-bottom:26px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${tokens.accent};margin-top:14px;flex-shrink:0;"></span>
            <div style="font-size:30px;line-height:1.64;color:${tokens.ink};font-family:${tokens.fontBody};flex:1;word-break:break-word;">${escapeHtml(cleanText)}</div>
          </div>
        `;
      })
      .join('');

    bodyMarkup = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px 0;">
        <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:28px;">
          <span style="font-size:24px;font-weight:700;color:${tokens.accent};font-family:${tokens.fontCode};">§${pageNumber}</span>
          <h2 style="font-size:44px;font-weight:600;color:${tokens.ink};font-family:${tokens.fontDisplay};letter-spacing:-0.01em;margin:0;">${escapeHtml(card.title)}</h2>
        </div>

        <div style="background:${tokens.cardBg};border:1.5px solid ${tokens.line};border-radius:24px;padding:44px;box-shadow:0 8px 30px rgba(0,0,0,0.04);">
          ${listItems}
        </div>
      </div>
    `;
  }

  const footerAction = isLast ? 'Finish & Explore ➔' : 'Swipe Next ➔';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Vmark Editorial Card</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1440px;
      overflow: hidden;
      background: ${tokens.paper};
      font-family: ${tokens.fontBody};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 88px 80px 96px 80px;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 22px;
      border-bottom: 1.5px solid ${tokens.line};
    }
    .header-brand {
      font-size: 22px;
      font-weight: 800;
      color: ${tokens.ink};
      letter-spacing: 2px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${tokens.accent};
      display: inline-block;
    }
    .header-badge {
      font-size: 20px;
      font-weight: 700;
      color: ${tokens.accentInk};
      font-family: ${tokens.fontCode};
      background: ${tokens.accentSurface};
      padding: 6px 16px;
      border-radius: 999px;
      border: 1px solid ${tokens.line};
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 22px;
      border-top: 1.5px solid ${tokens.line};
    }
    .footer-note {
      font-size: 20px;
      font-weight: 500;
      color: ${tokens.textMuted};
      letter-spacing: 0.5px;
    }
    .footer-nav {
      font-size: 20px;
      font-weight: 700;
      color: ${tokens.accent};
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-brand">
      <span class="header-dot"></span>
      <span>${escapeHtml(brandName)}</span>
    </div>
    <div class="header-badge">${pageNumber} / ${totalCount}</div>
  </div>

  ${bodyMarkup}

  <div class="footer">
    <div class="footer-note">Guizang Editorial × Ray.so Design • 极客排版</div>
    <div class="footer-nav">${footerAction}</div>
  </div>
</body>
</html>`;
}
