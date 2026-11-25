import type { XhsCardSection } from './xiaohongshuRenderer.ts';
import type { CardBlock } from './socialCardBlocks.ts';
import type { PlacedCardBlock } from './socialCardPaginate.ts';
import { cardBlocksCss, cardFlowHtml, cardInlineHtml } from './socialCardBlocksHtml.ts';
import { CARD_DESIGN_WIDTH, cardDesignHeight } from './socialCardLayout.ts';
import { CARD_MATH_CSS, type CardMathRenderer } from './socialCardMath.ts';
import { stripInlineMarkdown } from './socialMarkdownUtils.ts';
import {
  CARD_CHROME_INSETS,
  GENRE_META,
  PLATFORM_COVER_SPECS,
  getSocialCardTheme,
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

const esc = escapeHtml;

const OPEN_BRACKETS = '（(【[《〈「『';
const CLOSE_BRACKETS = '）)】]》〉」』';

/**
 * Running title for the page header (magazine masthead, book running head): at most `max`
 * characters. A trailing note in brackets (「（图 3 · 流程总览）」) is dropped first; if the title
 * is still too long it ends with「…」and never stops inside an unclosed bracket.
 */
export function cardRunningTitle(title: string, max: number): string {
  const plain = stripInlineMarkdown(title).replace(/\s+/g, ' ').trim();
  if ([...plain].length <= max) return plain;
  const withoutNote = plain.replace(/\s*[（(【\[][^（()）【】\[\]]*[）)】\]]\s*$/, '').trim();
  if (withoutNote && [...withoutNote].length <= max) return withoutNote;
  const chars = [...(withoutNote || plain)].slice(0, Math.max(1, max - 1));
  let depth = 0;
  let lastSafe = chars.length;
  chars.forEach((ch, i) => {
    if (OPEN_BRACKETS.includes(ch)) {
      if (depth === 0) lastSafe = i;
      depth++;
    } else if (CLOSE_BRACKETS.includes(ch) && depth > 0) depth--;
  });
  const cut = (depth > 0 ? chars.slice(0, lastSafe) : chars).join('');
  return `${cut.replace(/[\s，,、：:；;·—-]+$/, '')}…`;
}

export interface RenderCardHtmlOptions {
  themeId?: string;
  cardIndex: number;
  totalCards: number;
  brandName?: string;
  aspectRatio?: PlatformCoverRatio;
  timestamp?: string;
  /** Show "n / total" in the footer (default true). */
  showPageNumber?: boolean;
  /** Optional brand / signature shown in the footer and on the cover. */
  footerBrand?: string;
  /** Renders `$…$` / `$$…$$` (KaTeX in the app); without it formulas use a Unicode approximation. */
  math?: CardMathRenderer;
}

/** Cards built before block flow (or by hand) only carry text lines: turn them into blocks. */
function legacyBlocks(card: XhsCardSection): PlacedCardBlock[] {
  const out: CardBlock[] = [{ kind: 'heading', level: 2, text: card.title }];
  if (card.quote) out.push({ kind: 'quote', text: card.quote });
  if (card.type === 'code') {
    out.push({ kind: 'code', lang: card.codeLang || 'code', lines: card.bodyLines });
  } else {
    for (const raw of card.bodyLines) {
      const t = raw.trim();
      const num = t.match(/^(\d+\.)\s+(.+)$/);
      if (t.startsWith('>')) out.push({ kind: 'quote', text: t.replace(/^>\s*/, '') });
      else if (/^[•\-*]\s*/.test(t)) out.push({ kind: 'list-item', text: t.replace(/^[•\-*]\s*/, ''), marker: '•', ordered: false, depth: 0 });
      else if (num) out.push({ kind: 'list-item', text: num[2], marker: num[1], ordered: true, depth: 0 });
      else if (t) out.push({ kind: 'paragraph', text: t });
    }
  }
  if (card.closingQuote) out.push({ kind: 'quote', text: card.closingQuote });
  return out.map((block) => ({ block, height: 0 }));
}

function titleSize(title: string): number {
  const n = [...title].length;
  return n <= 10 ? 104 : n <= 18 ? 92 : n <= 30 ? 78 : 66;
}

function coverHtml(card: XhsCardSection, t: SocialCardTokens, chrome: string, brand: string, total: number): string {
  const genre = GENRE_META[card.genre || 'essay'];
  const sub = card.subtitle && card.subtitle !== genre.badge ? card.subtitle : '';
  const tags = (card.tags || []).slice(0, 4).map((x) => `<span class="tag">#${esc(x)}</span>`).join('');
  const align = chrome === 'elegant-book' || chrome === 'minimalist-magazine' ? 'center' : 'left';
  const ornament = chrome === 'elegant-book' ? '<div class="orn">❦</div>' : `<div class="bar"></div>`;
  return `<div class="cover cover-${align}">
  <div class="kicker">${esc(chrome === 'minimalist-magazine' ? genre.kicker : genre.badge)}</div>
  <h1 class="ct" style="font-size:${titleSize(card.title)}px">${cardInlineHtml(card.title)}</h1>
  ${ornament}
  ${sub ? `<p class="cs">${cardInlineHtml(sub)}</p>` : ''}
  <div class="cfoot">${tags ? `<div class="tags">${tags}</div>` : ''}<div class="hint">${brand ? `${esc(brand)} · ` : ''}${total > 1 ? '左滑阅读全文 →' : ''}</div></div>
</div>`;
}

function coverCss(t: SocialCardTokens): string {
  return `
.cover{height:100%;display:flex;flex-direction:column;justify-content:center;font-family:${t.fontDisplay};}
.cover-center{align-items:center;text-align:center;}
.cover .kicker{font-size:30px;font-weight:700;letter-spacing:6px;color:${t.accent};margin-bottom:40px;}
.cover .ct{font-weight:900;line-height:1.28;text-wrap:balance;color:${t.headingInk};letter-spacing:1px;margin:0;overflow-wrap:break-word;}
.cover .bar{width:120px;height:12px;border-radius:6px;background:${t.accent};margin:52px 0 44px;}
.cover .orn{font-size:56px;color:${t.accent};margin:44px 0 36px;}
.cover .cs{font-family:${t.fontBody};font-size:42px;line-height:1.7;color:${t.textSecondary};max-width:980px;}
.cover .cfoot{margin-top:72px;display:flex;flex-direction:column;gap:28px;}
.cover-center .cfoot{align-items:center;}
.cover .tags{display:flex;flex-wrap:wrap;gap:16px;}
.cover .tag{font-family:${t.fontBody};font-size:30px;font-weight:600;color:${t.accentInk};background:${t.accentSurface};padding:10px 26px;border-radius:999px;}
.cover .hint{font-family:${t.fontBody};font-size:28px;color:${t.textMuted};letter-spacing:1px;}`;
}

interface ChromeParts {
  bg: string;
  css: string;
  before: string;
  after: string;
  boxClass: string;
}

function chromeParts(t: SocialCardTokens, title: string, opts: RenderCardHtmlOptions): ChromeParts {
  const page = opts.showPageNumber === false ? '' : `${opts.cardIndex + 1} / ${opts.totalCards}`;
  const brand = esc(opts.footerBrand || '');
  const foot = (cls: string, left: string, right: string) => `<div class="foot ${cls}"><span>${left}</span><span>${right}</span></div>`;
  switch (t.chrome) {
    case 'ios-memo':
      return {
        bg: '#FFFFFF',
        boxClass: 'ios-sheet',
        css: `.bar-top{position:absolute;left:0;right:0;top:0;height:120px;padding:0 56px;display:flex;align-items:center;justify-content:space-between;color:${t.accent};font-size:40px;font-weight:500;}
.bar-top .back{display:flex;align-items:center;gap:10px;}
.stamp{position:absolute;left:0;right:0;top:122px;text-align:center;font-size:26px;color:${t.textMuted};}`,
        before: `<div class="bar-top"><div class="back"><svg width="24" height="40" viewBox="0 0 14 24"><path d="M11.5 2.5L2.5 12L11.5 21.5" stroke="${t.accent}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>备忘录</div><div>完成</div></div><div class="stamp">${esc(opts.timestamp || '')}</div>`,
        after: foot('', brand, page),
      };
    case 'minimalist-magazine':
      return {
        bg: t.paper,
        boxClass: 'mag-frame',
        css: `.mast{position:absolute;left:104px;right:104px;top:64px;height:64px;display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:14px;border-bottom:3px solid ${t.ink};font-size:24px;letter-spacing:5px;color:${t.accent};font-weight:700;}
.foot{border-top:1.5px solid ${t.line};padding-top:22px;}`,
        before: `<div class="mast"><span>${esc(t.kicker)}</span><span>${esc(cardRunningTitle(title, 16))}</span></div>`,
        after: foot('', brand, page),
      };
    case 'elegant-book':
      return {
        bg: 'linear-gradient(90deg,#EFE7D8 0%,#FBF8F1 7%,#FDFBF7 100%)',
        boxClass: 'book-content',
        css: `.run{position:absolute;left:120px;right:120px;top:72px;text-align:center;font-size:24px;letter-spacing:6px;color:${t.textMuted};}
.foot{justify-content:center;font-size:28px;}`,
        before: `<div class="run">${esc(cardRunningTitle(title, 22))}</div>`,
        after: `<div class="foot"><span>${page ? `— ${opts.cardIndex + 1} —` : ''}</span></div>`,
      };
    case 'fresh-gradient':
      return {
        bg: t.paper,
        boxClass: 'fresh-panel',
        css: `.panel{position:absolute;left:56px;right:56px;top:100px;bottom:136px;border-radius:44px;background:${t.cardBg};box-shadow:0 24px 60px rgba(15,118,110,0.12);border:2px solid rgba(255,255,255,0.9);}
.blob{position:absolute;border-radius:50%;filter:blur(8px);}
.foot{bottom:52px;}
.foot .pill{background:rgba(255,255,255,0.7);padding:8px 24px;border-radius:999px;color:${t.accentInk};font-weight:600;}`,
        before: `<div class="blob" style="width:520px;height:520px;right:-160px;top:-180px;background:radial-gradient(circle,rgba(45,212,191,0.35),transparent 70%)"></div><div class="blob" style="width:600px;height:600px;left:-220px;bottom:-200px;background:radial-gradient(circle,rgba(167,139,250,0.30),transparent 70%)"></div><div class="panel"></div>`,
        after: foot('', brand, page ? `<span class="pill">${page}</span>` : ''),
      };
    case 'grid-notebook':
      return {
        // 方格纸：两层 1px 细线渐变平铺，纯 CSS，无图片资源
        bg: `linear-gradient(${t.ruledLineColor} 2px, transparent 2px) 0 0 / 46px 46px, linear-gradient(90deg, ${t.ruledLineColor} 2px, transparent 2px) 0 0 / 46px 46px, ${t.paper}`,
        boxClass: 'grid-paper',
        css: `.tape{position:absolute;left:88px;top:58px;width:280px;height:70px;background:${t.highlightBg};opacity:0.9;border-left:6px dotted ${t.paper};border-right:6px dotted ${t.paper};transform:rotate(-4deg);}
.nb-head{position:absolute;right:112px;top:76px;font-size:26px;letter-spacing:4px;color:${t.textMuted};}
.grid-paper .b-table table,.grid-paper .b-code{background:${t.codeBg};}
.grid-paper .b-h2{display:inline-block;align-self:flex-start;padding:0 12px;background:linear-gradient(transparent 58%, ${t.highlightBg} 58%);}`,
        before: `<div class="tape"></div><div class="nb-head">${esc(opts.timestamp || t.kicker)}</div>`,
        after: foot('', brand, page),
      };
    case 'sticky-note':
      return {
        bg: t.paper,
        boxClass: 'sticky-sheet',
        css: `.sheet{position:absolute;left:72px;right:72px;top:104px;bottom:110px;background:${t.sheetBg};border-radius:6px 6px 6px 64px;box-shadow:0 30px 50px rgba(60,48,20,0.18),0 4px 10px rgba(60,48,20,0.10);}
.pin{position:absolute;left:50%;top:70px;width:56px;height:56px;margin-left:-28px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#F19A8F,${t.accent} 60%,#7B241C);box-shadow:0 8px 12px rgba(0,0,0,0.25);}
.foot{left:128px;right:128px;bottom:140px;color:${t.textMuted};}`,
        before: '<div class="sheet"></div><div class="pin"></div>',
        after: foot('', brand, page),
      };
    default:
      return { bg: t.paper, boxClass: 'blank-content', css: '', before: '', after: foot('', brand, page) };
  }
}

/** The DOM surface fitCardOverflow needs (core has no DOM types). */
interface FitOverflowElement {
  scrollHeight: number;
  clientHeight: number;
  style: { zoom: string };
  firstElementChild: FitOverflowElement | null;
}

/**
 * Last resort when the content flow is taller than the card's content box (estimated heights in
 * the preview, a font wider than measured): zooms the flow down until it fits, so the page bottom
 * and images are never cut by the box's overflow:hidden. Returns the overflow ratio (1 = fits).
 * Must stay self-contained: the rasterizer injects its source text into the offscreen page.
 */
export function fitCardOverflow(root: { querySelector(selector: string): FitOverflowElement | null }): number {
  const box = root.querySelector('.box');
  const inner = box ? box.firstElementChild : null;
  if (!box || !inner || box.clientHeight <= 0) return 1;
  inner.style.zoom = '';
  const over = inner.scrollHeight / box.clientHeight;
  if (over > 1.002) inner.style.zoom = String(Math.floor(1000 / over) / 1000);
  return over;
}

/**
 * Renders one social card as a standalone HTML document at the platform resolution
 * (3:4 → 1242×1656). Layout is authored on a 1242px-wide canvas and zoomed to the output width.
 */
export function renderSocialCardHtml(card: XhsCardSection, options: RenderCardHtmlOptions): string {
  const t = getSocialCardTheme(options.themeId);
  const ratio = options.aspectRatio || '3:4';
  const spec = PLATFORM_COVER_SPECS[ratio] || PLATFORM_COVER_SPECS['3:4'];
  const h = cardDesignHeight(spec.width, spec.height);
  const zoom = spec.width / CARD_DESIGN_WIDTH;
  const insets = CARD_CHROME_INSETS[t.chrome];
  const isCover = card.type === 'cover';
  const brand = options.footerBrand || '';
  const timestamp = options.timestamp ?? new Date().toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = chromeParts(t, card.title, { ...options, timestamp, footerBrand: isCover ? '' : options.footerBrand });
  const inner = isCover
    ? coverHtml(card, t, t.chrome, brand, options.totalCards)
    : `<div class="flow">${cardFlowHtml(card.blocks?.length ? card.blocks : legacyBlocks(card), t, options.math)}</div>`;
  const mathCss = options.math && inner.includes('class="katex') ? `${options.math.css}\n${CARD_MATH_CSS}` : '';
  const pageLabel = `${String(options.cardIndex + 1).padStart(2, '0')} / ${String(options.totalCards).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${esc(options.brandName || 'Vmark')} - ${esc(t.name)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${spec.width}px; height: ${spec.height}px; overflow: hidden; }
body { -webkit-font-smoothing: antialiased; font-family: ${t.fontBody}; }
.card { position: relative; width: ${CARD_DESIGN_WIDTH}px; height: ${h}px; zoom: ${zoom}; overflow: hidden; background: ${parts.bg}; }
.box { position: absolute; left: ${insets.x}px; right: ${insets.x}px; top: ${insets.top}px; bottom: ${insets.bottom}px; overflow: hidden; }
.foot { position: absolute; left: ${insets.x}px; right: ${insets.x}px; bottom: 64px; display: flex; justify-content: space-between; align-items: center; font-size: 26px; color: ${t.textMuted}; letter-spacing: 1px; }
${parts.css}
${cardBlocksCss(t)}
${coverCss(t)}
${mathCss}
</style>
</head>
<body data-page="${pageLabel}" data-template="${esc(t.id)}">
<div class="card">
${parts.before}
<div class="box ${parts.boxClass}">${inner}</div>
${parts.after}
</div>
</body>
</html>`;
}
