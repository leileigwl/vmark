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

/** Wraps KaTeX: HTML output only (no hidden MathML copy), bad TeX shows in red instead of throwing. */
export function createKatexCardMath(katex: KatexLike, css: string): CardMathRenderer {
  return {
    css,
    render: (tex, displayMode) => {
      try {
        return katex.renderToString(tex, { displayMode, throwOnError: false, output: 'html', strict: 'ignore' });
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

/** Card-specific tweaks: display formulas sit inside the padded `.b-math` box, so no extra margin. */
export const CARD_MATH_CSS = '.b-math .katex-display{margin:0;}';
