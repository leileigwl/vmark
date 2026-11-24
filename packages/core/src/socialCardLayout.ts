/**
 * Shared layout constants for 3:4 social text cards.
 * All values are design pixels on a 1242px-wide canvas (1242×1656 for 3:4).
 * The HTML renderer and the height estimator both read these, so estimated
 * pagination and the rendered card agree.
 */

export const CARD_DESIGN_WIDTH = 1242;

export interface CardTypeScale {
  bodySize: number;
  bodyLine: number;
  paraGap: number;
  h2Size: number;
  h2Line: number;
  h3Size: number;
  h3Line: number;
  headingGapTop: number;
  headingGapBottom: number;
  listGap: number;
  listIndent: number;
  quoteSize: number;
  quoteLine: number;
  quotePadY: number;
  quotePadX: number;
  quoteGap: number;
  codeSize: number;
  codeLine: number;
  codeHeader: number;
  codePad: number;
  codeGap: number;
  tableSize: number;
  tableLine: number;
  tableCellPadY: number;
  tableCellPadX: number;
  tableGap: number;
  imageGap: number;
  imageMaxRatio: number;
  mathSize: number;
}

export const CARD_TYPE_SCALE: CardTypeScale = {
  bodySize: 40,
  bodyLine: 1.8,
  paraGap: 30,
  h2Size: 54,
  h2Line: 1.35,
  h3Size: 46,
  h3Line: 1.4,
  headingGapTop: 26,
  headingGapBottom: 22,
  listGap: 16,
  listIndent: 52,
  quoteSize: 36,
  quoteLine: 1.75,
  quotePadY: 26,
  quotePadX: 36,
  quoteGap: 32,
  codeSize: 26,
  codeLine: 1.6,
  codeHeader: 60,
  codePad: 30,
  codeGap: 32,
  tableSize: 30,
  tableLine: 1.5,
  tableCellPadY: 16,
  tableCellPadX: 20,
  tableGap: 32,
  imageGap: 32,
  imageMaxRatio: 0.62,
  mathSize: 32,
};

/** Insets of the content box inside the card (design px), per template chrome. */
export interface CardContentInsets {
  x: number;
  top: number;
  bottom: number;
}

export interface CardContentBox {
  width: number;
  height: number;
}

/** Design height for a given output spec, keeping the 1242px design width. */
export function cardDesignHeight(specWidth: number, specHeight: number): number {
  return Math.round((CARD_DESIGN_WIDTH * specHeight) / specWidth);
}

export function contentBoxFor(insets: CardContentInsets, designHeight: number): CardContentBox {
  return {
    width: CARD_DESIGN_WIDTH - insets.x * 2,
    height: designHeight - insets.top - insets.bottom,
  };
}

const WIDE_CHAR = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u3000-\u303F]/;
const EMOJI = /\p{Extended_Pictographic}/u;

/** Approximate rendered width (in em) of a text run once inline markdown is removed. */
export function textWidthEm(text: string): number {
  const plain = text
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1');
  let em = 0;
  for (const ch of plain) {
    if (WIDE_CHAR.test(ch) || EMOJI.test(ch)) em += 1;
    else if (/[A-Z0-9]/.test(ch)) em += 0.62;
    else if (/[a-z]/.test(ch)) em += 0.54;
    else if (ch === ' ') em += 0.28;
    else em += 0.4;
  }
  return em;
}

/** Number of wrapped lines a text run needs in a box `boxWidth` px wide. */
export function estimateLineCount(text: string, fontSize: number, boxWidth: number): number {
  if (!text) return 1;
  const charsPerLine = Math.max(1, boxWidth / fontSize);
  // Line breaking wastes a little space at line ends (kinsoku, latin words): pad 4%.
  return Math.max(1, Math.ceil((textWidthEm(text) * 1.04) / charsPerLine));
}
