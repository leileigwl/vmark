import type { XhsCardSection } from './xiaohongshuRenderer.ts';
import { getSocialCardTheme, type SocialCardTheme } from './socialCardThemes.ts';

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
 * Renders a single 3:4 (1080x1440) Xiaohongshu/Douyin card HTML string ready for offscreen rasterization.
 */
export function renderSocialCardHtml(
  card: XhsCardSection,
  options: RenderCardHtmlOptions
): string {
  const theme: SocialCardTheme = getSocialCardTheme(options.themeId);
  const { cardIndex, totalCards, brandName = 'Vmark' } = options;
  const pageIndicator = `${String(cardIndex + 1).padStart(2, '0')} / ${String(totalCards).padStart(2, '0')}`;

  let bodyContent = '';

  if (card.type === 'cover') {
    const tagsHtml = (card.tags || [])
      .map(
        (t) =>
          `<span style="background:${theme.tagBackground};color:${theme.tagTextColor};padding:6px 16px;border-radius:20px;font-size:22px;font-weight:600;display:inline-block;margin-right:12px;margin-bottom:12px;">#${escapeHtml(t)}</span>`
      )
      .join('');

    const linesHtml = card.bodyLines
      .map(
        (line) =>
          `<div style="font-size:28px;line-height:1.6;color:${theme.secondaryTextColor};margin-bottom:12px;">${escapeHtml(line)}</div>`
      )
      .join('');

    bodyContent = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:40px 0;">
        <div style="font-size:24px;font-weight:700;color:${theme.primaryColor};text-transform:uppercase;letter-spacing:2px;margin-bottom:24px;">${escapeHtml(card.subtitle || 'TECH NOTE')}</div>
        <h1 style="font-size:64px;font-weight:800;line-height:1.25;color:${theme.textColor};margin:0 0 36px 0;letter-spacing:-0.5px;">${escapeHtml(card.title)}</h1>
        <div style="margin-bottom:40px;">${linesHtml}</div>
        <div style="display:flex;flex-wrap:wrap;">${tagsHtml}</div>
      </div>
    `;
  } else if (card.type === 'code') {
    const codeLines = card.bodyLines
      .map((line, idx) => {
        const lineNum = String(idx + 1).padStart(2, ' ');
        return `<tr>
          <td style="color:${theme.secondaryTextColor};user-select:none;padding-right:18px;text-align:right;font-size:22px;font-family:monospace;opacity:0.6;">${lineNum}</td>
          <td style="color:${theme.codeColor};font-size:24px;font-family:'JetBrains Mono', Consolas, monospace;white-space:pre-wrap;word-break:break-all;line-height:1.5;">${escapeHtml(line)}</td>
        </tr>`;
      })
      .join('');

    bodyContent = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:20px 0;">
        <h2 style="font-size:42px;font-weight:700;color:${theme.textColor};margin:0 0 28px 0;border-left:8px solid ${theme.primaryColor};padding-left:20px;line-height:1.2;">${escapeHtml(card.title)}</h2>
        <div style="background:${theme.codeBackground};border:1.5px solid ${theme.borderColor};border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.12);">
          <div style="background:rgba(0,0,0,0.08);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${theme.borderColor};">
            <div style="display:flex;gap:8px;">
              <span style="width:14px;height:14px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
              <span style="width:14px;height:14px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
              <span style="width:14px;height:14px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
            </div>
            <span style="font-size:18px;font-weight:600;color:${theme.secondaryTextColor};font-family:monospace;">${escapeHtml(card.codeLang || 'snippet')}</span>
          </div>
          <div style="padding:24px 20px;overflow:hidden;">
            <table style="border-collapse:collapse;width:100%;">${codeLines}</table>
          </div>
        </div>
      </div>
    `;
  } else {
    // Normal content card
    const itemsHtml = card.bodyLines
      .map((line) => {
        const isBullet = line.startsWith('•') || line.startsWith('-');
        const text = line.replace(/^[•-]\s*/, '');
        return `
          <div style="display:flex;align-items:flex-start;margin-bottom:24px;">
            ${
              isBullet
                ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${theme.primaryColor};margin-top:14px;margin-right:16px;flex-shrink:0;"></span>`
                : ''
            }
            <div style="font-size:30px;line-height:1.6;color:${theme.textColor};flex:1;word-break:break-word;">${escapeHtml(text)}</div>
          </div>
        `;
      })
      .join('');

    bodyContent = `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:20px 0;">
        <h2 style="font-size:44px;font-weight:700;color:${theme.textColor};margin:0 0 36px 0;border-left:8px solid ${theme.primaryColor};padding-left:20px;line-height:1.2;">${escapeHtml(card.title)}</h2>
        <div style="background:${theme.cardBackground};border:1.5px solid ${theme.borderColor};border-radius:20px;padding:40px;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Vmark Card</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1440px;
      overflow: hidden;
      background: ${theme.background};
      font-family: ${theme.fontFamily};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 64px 72px;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1.5px solid ${theme.borderColor};
    }
    .header-brand {
      font-size: 24px;
      font-weight: 800;
      color: ${theme.primaryColor};
      letter-spacing: 1.5px;
    }
    .header-page {
      font-size: 22px;
      font-weight: 700;
      color: ${theme.secondaryTextColor};
      font-family: monospace;
      background: ${theme.tagBackground};
      padding: 4px 14px;
      border-radius: 12px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 24px;
      border-top: 1.5px solid ${theme.borderColor};
    }
    .footer-left {
      font-size: 20px;
      color: ${theme.secondaryTextColor};
    }
    .footer-right {
      font-size: 20px;
      font-weight: 600;
      color: ${theme.primaryColor};
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-brand">${escapeHtml(brandName)}</div>
    <div class="header-page">${pageIndicator}</div>
  </div>

  ${bodyContent}

  <div class="footer">
    <div class="footer-left">Created with Vmark • 极客创作</div>
    <div class="footer-right">Swipe Next ➔</div>
  </div>
</body>
</html>`;
}
