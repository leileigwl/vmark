/**
 * Formula rendering for social cards. Core stays dependency-free: the app passes
 * in KaTeX (see createKatexCardMath) and the cards call it for `$…$` / `$$…$$`.
 */

/** Renders TeX to HTML for cards. */
export interface CardMathRenderer {
  /** HTML for one formula. Must not throw. */
  render(tex: string, displayMode: boolean): string;
  /** Stylesheet (fonts included) put into every card that shows a formula. */
  css: string;
}

/** The part of the KaTeX API the cards use. */
export interface KatexLike {
  renderToString(
    tex: string,
    options: { displayMode: boolean; throwOnError: boolean; output: 'html'; strict: 'ignore' }
  ): string;
}

/**
 * Wraps KaTeX: HTML output only (no hidden MathML copy), bad TeX shows in red instead of throwing.
 * Display formulas are typeset as `\displaystyle` in inline mode (same size and look), because only
 * inline mode lets a long formula wrap after `=` / `+` like TeX. What inline mode cannot typeset
 * (`\tag`, `align` / `gather` / `CD` environments) falls back to real display mode.
 */
export function createKatexCardMath(katex: KatexLike, css: string): CardMathRenderer {
  const opts = { throwOnError: false, output: 'html', strict: 'ignore' } as const;
  return {
    css,
    render: (tex, displayMode) => {
      try {
        if (displayMode) {
          const wrappable = katex.renderToString(`\\displaystyle ${tex}`, { ...opts, displayMode: false });
          if (!wrappable.includes('katex-error')) return `<span class="katex-display b-math-wrap">${wrappable}</span>`;
        }
        return katex.renderToString(tex, { ...opts, displayMode });
      } catch {
        return `<code>${tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
      }
    },
  };
}

/** Points KaTeX's relative `url(fonts/…)` at a base URL the card page can load (file://, app assets). */
export function rebaseKatexFonts(css: string, fontBaseUrl: string): string {
  const base = fontBaseUrl.endsWith('/') ? fontBaseUrl : `${fontBaseUrl}/`;
  return css.replace(/url\((['"]?)fonts\//g, `url($1${base}`);
}

/**
 * Inline `$…$` (pandoc rule): the opening `$` is not followed by a space, the closing `$`
 * is not preceded by a space nor followed by a digit, so prices like "$5 到 $10" stay text.
 */
const INLINE_MATH = /(^|[^\\$])\$(?=\S)([^$\n]*?\S)\$(?!\d)/g;

/** Replaces inline formulas with placeholders; returns the text and the rendered formulas. */
export function extractInlineMath(raw: string, math: CardMathRenderer): { text: string; formulas: string[] } {
  const formulas: string[] = [];
  const text = raw.replace(INLINE_MATH, (_m, lead: string, tex: string) => {
    formulas.push(math.render(tex, false));
    return `${lead}\u0000${formulas.length - 1}\u0000`;
  });
  return { text, formulas };
}

export function restoreInlineMath(html: string, formulas: string[]): string {
  return formulas.length ? html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => formulas[Number(i)] ?? '') : html;
}

/**
 * Card-specific tweaks: display formulas sit inside the padded `.b-math` box, so no extra margin;
 * wrappable display formulas (see createKatexCardMath) break between terms, each line centred.
 */
export const CARD_MATH_CSS = '.b-math .katex-display{margin:0;}.b-math .b-math-wrap>.katex{white-space:normal;line-height:1.5;}';

/** The DOM surface fitCardDisplayMath needs (core has no DOM types). */
interface FitMathElement {
  scrollWidth: number;
  clientWidth: number;
  style: { zoom: string };
}

/**
 * Last resort for a display formula that still cannot fit the card width after wrapping (a wide
 * matrix, one huge fraction): zooms it down until it fits, so nothing is cut off at the card edge.
 * Normal formulas are left at zoom 1. Runs in the card page after fonts load; must stay
 * self-contained (the rasterizer injects its source text into the offscreen page).
 */
export function fitCardDisplayMath(root: { querySelectorAll(selector: string): ArrayLike<FitMathElement> }): void {
  const list = root.querySelectorAll('.b-math .katex-display');
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    el.style.zoom = '';
    const over = el.clientWidth > 0 ? el.scrollWidth / el.clientWidth : 1;
    if (over > 1.002) el.style.zoom = String(Math.floor(1000 / over) / 1000);
  }
}
