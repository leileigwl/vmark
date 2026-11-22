import type { CardBlock } from './socialCardBlocks.ts';
import type { PlacedCardBlock } from './socialCardPaginate.ts';
import { CARD_TYPE_SCALE, type CardTypeScale } from './socialCardLayout.ts';
import type { SocialCardTokens } from './socialCardThemes.ts';
import { CARD_MATH_CSS, extractInlineMath, restoreInlineMath, type CardMathRenderer } from './socialCardMath.ts';

export function escapeCardHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline markdown (bold, ==highlight==, italic, del, code, and `$…$` when a math renderer is given) to class-based HTML. */
export function cardInlineHtml(raw: string, math?: CardMathRenderer): string {
  const { text, formulas } = math ? extractInlineMath(raw, math) : { text: raw, formulas: [] };
  const html = escapeCardHtml(text)
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return restoreInlineMath(html, formulas);
}

/**
 * Stylesheet for flowing blocks. Sizes come from CARD_TYPE_SCALE so that the
 * estimator, the in-browser measurement and the final card all agree.
 */
export function cardBlocksCss(t: SocialCardTokens, s: CardTypeScale = CARD_TYPE_SCALE): string {
  return `
.flow{display:flex;flex-direction:column;color:${t.ink};font-family:${t.fontBody};font-size:${s.bodySize}px;line-height:${s.bodyLine};letter-spacing:${t.letterSpacing};}
.flow>*{flex-shrink:0;}
.flow>:first-child{margin-top:0!important;}
.flow .b-h{margin:${s.headingGapTop}px 0 ${s.headingGapBottom}px;font-family:${t.fontDisplay};font-weight:800;color:${t.headingInk};letter-spacing:0.5px;text-wrap:balance;}
.flow .b-h2{font-size:${s.h2Size}px;line-height:${s.h2Line};}
.flow .b-h3{font-size:${s.h3Size}px;line-height:${s.h3Line};}
.flow .b-p{margin:0 0 ${s.paraGap}px;overflow-wrap:break-word;}
.flow .b-li{display:flex;gap:16px;margin:0 0 ${s.listGap}px;padding-left:0;overflow-wrap:break-word;}
.flow .b-li>i{flex:0 0 36px;font-style:normal;font-weight:700;color:${t.accent};text-align:center;}
.flow .b-li>div{flex:1;min-width:0;}
.flow .b-d1{margin-left:${s.listIndent}px;} .flow .b-d2{margin-left:${s.listIndent * 2}px;}
.flow .b-q{margin:0 0 ${s.quoteGap}px;padding:${s.quotePadY}px ${s.quotePadX}px;border-left:8px solid ${t.lineStrong};border-radius:0 18px 18px 0;background:${t.quoteBg};color:${t.textSecondary};font-size:${s.quoteSize}px;line-height:${s.quoteLine};overflow-wrap:break-word;}
.flow .b-code{margin:0 0 ${s.codeGap}px;border-radius:22px;overflow:hidden;background:${t.codeBg};border:1.5px solid ${t.codeBorder};}
.flow .b-code-bar{height:${s.codeHeader}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${s.codePad}px;border-bottom:1px solid ${t.codeBorder};}
.flow .b-code-bar span.d{display:inline-block;width:16px;height:16px;border-radius:50%;margin-right:10px;}
.flow .b-code-bar b{font:600 20px ${t.fontCode};color:${t.textMuted};text-transform:uppercase;letter-spacing:1px;}
.flow .b-code table{border-collapse:collapse;width:100%;margin:${s.codePad}px 0;}
.flow .b-code td{font-family:${t.fontCode};font-size:${s.codeSize}px;line-height:${s.codeLine};vertical-align:top;padding:0;}
.flow .b-code td.n{width:64px;padding-left:${s.codePad - 6}px;color:${t.textMuted};opacity:0.6;text-align:right;user-select:none;}
.flow .b-code td.c{padding:0 ${s.codePad}px 0 18px;color:${t.codeInk};white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;}
.flow .b-table{margin:0 0 ${s.tableGap}px;border-radius:18px;overflow:hidden;border:1.5px solid ${t.line};}
.flow .b-table table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:${s.tableSize}px;line-height:${s.tableLine};}
.flow .b-table th,.flow .b-table td{padding:${s.tableCellPadY}px ${s.tableCellPadX}px;text-align:left;vertical-align:top;overflow-wrap:break-word;}
.flow .b-table.wide table{font-size:${s.tableSize - 4}px;}
.flow .b-table th{background:${t.accentSurface};color:${t.headingInk};font-weight:700;}
.flow .b-table tr+tr td{border-top:1px solid ${t.line};}
.flow .b-fig{margin:0 0 ${s.imageGap}px;display:flex;justify-content:center;}
.flow .b-fig img{display:block;max-width:100%;border-radius:20px;object-fit:contain;}
.flow .b-math{margin:0 0 ${s.paraGap}px;padding:24px;text-align:center;font-family:${t.fontCode};font-size:${s.mathSize}px;line-height:1.6;color:${t.textSecondary};background:${t.quoteBg};border-radius:16px;overflow-wrap:anywhere;}
.flow mark{background:${t.highlightBg};color:inherit;padding:0 6px;border-radius:6px;}
.flow strong{font-weight:800;color:${t.headingInk === t.ink ? t.accentInk : t.ink};}
.flow em{font-style:italic;}
.flow del{opacity:0.6;}
.flow code{font-family:${t.fontCode};font-size:0.86em;background:${t.accentSurface};padding:2px 8px;border-radius:8px;}
`;
}

const TEX_SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  approx: '≈', infty: '∞', sum: '∑', prod: '∏', int: '∫', sqrt: '√', partial: '∂', to: '→', rightarrow: '→',
  leftarrow: '←', Rightarrow: '⇒', in: '∈', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ',
  epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', Sigma: 'Σ', phi: 'φ', omega: 'ω', Omega: 'Ω',
};
const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', n: 'ⁿ' };

/** Offline, dependency-free TeX approximation: common symbols to Unicode, fractions to a/b. */
export function texToText(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\(?:left|right|,|;|!|quad|qquad)/g, ' ')
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => TEX_SYMBOLS[name] ?? name)
    .replace(/\^\{?([0-9n])\}?/g, (m, d: string) => SUPERSCRIPT[d] ?? m)
    .replace(/[{}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function codeHtml(b: Extract<CardBlock, { kind: 'code' }>, t: SocialCardTokens): string {
  const rows = b.lines
    .map((l, i) => `<tr><td class="n">${(b.start ?? 1) + i}</td><td class="c">${escapeCardHtml(l) || ' '}</td></tr>`)
    .join('');
  const dots = [t.windowDotRed, t.windowDotYellow, t.windowDotGreen].map((c) => `<span class="d" style="background:${c}"></span>`).join('');
  return `<div class="b-code"><div class="b-code-bar"><div>${dots}</div><b>${escapeCardHtml(b.lang || 'code')}</b></div><table>${rows}</table></div>`;
}

/** Renders one block as a single root element (so it can be measured on its own). */
export function cardBlockHtml(b: CardBlock, t: SocialCardTokens, imageMaxHeight?: number, math?: CardMathRenderer): string {
  const inline = (raw: string) => cardInlineHtml(raw, math);
  switch (b.kind) {
    case 'heading':
      return `<h${b.level} class="b-h b-h${b.level}">${inline(b.text)}</h${b.level}>`;
    case 'paragraph':
      return `<p class="b-p">${inline(b.text)}</p>`;
    case 'list-item':
      return `<div class="b-li b-d${b.depth}"><i>${escapeCardHtml(b.marker)}</i><div>${inline(b.text)}</div></div>`;
    case 'quote':
      return `<blockquote class="b-q">${inline(b.text)}</blockquote>`;
    case 'math':
      return math ? `<div class="b-math">${math.render(b.tex, true)}</div>` : `<div class="b-math">${escapeCardHtml(texToText(b.tex))}</div>`;
    case 'code':
      return codeHtml(b, t);
    case 'table': {
      const head = b.header.map((h) => `<th>${inline(h)}</th>`).join('');
      const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      return `<div class="b-table${b.header.length >= 5 ? ' wide' : ''}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    case 'image': {
      const max = imageMaxHeight ? `max-height:${Math.floor(imageMaxHeight)}px;` : '';
      return `<figure class="b-fig"><img src="${escapeCardHtml(b.src)}" alt="${escapeCardHtml(b.alt)}" style="${max}"></figure>`;
    }
  }
}

export function cardFlowHtml(blocks: PlacedCardBlock[], t: SocialCardTokens, math?: CardMathRenderer): string {
  return blocks.map((p) => cardBlockHtml(p.block, t, p.imageMaxHeight, math)).join('\n');
}

/**
 * A page that lays every block out at the content width with `data-b` indexes,
 * so a real browser can report each block's outer height for pagination.
 */
export function renderCardMeasureHtml(blocks: CardBlock[], t: SocialCardTokens, contentWidth: number, imageMaxHeight: number, math?: CardMathRenderer): string {
  const body = blocks
    .map((b, i) => cardBlockHtml(b, t, b.kind === 'image' ? imageMaxHeight : undefined, math).replace(/^<(\w+)/, `<$1 data-b="${i}"`))
    .join('\n');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}body{background:#fff;}${cardBlocksCss(t)}${math ? math.css + CARD_MATH_CSS : ''}</style></head><body><div class="flow" style="width:${contentWidth}px"><div></div>${body}</div></body></html>`;
}
