import { splitSentences, type CardBlock } from './socialCardBlocks.ts';
import { CARD_TYPE_SCALE, estimateLineCount, textWidthEm, type CardTypeScale } from './socialCardLayout.ts';

export interface PlacedCardBlock {
  block: CardBlock;
  /** Height reserved on the page, gaps included (design px). */
  height: number;
  /** For images: the max rendered image height, so a scaled image stays inside the card. */
  imageMaxHeight?: number;
}

export interface CardPageLayout {
  blocks: PlacedCardBlock[];
  used: number;
}

export interface PaginateCardOptions {
  /** Height of the content box (design px). */
  pageHeight: number;
  /** Outer height of a block (margins included) rendered at the content width. */
  measure: (block: CardBlock) => number;
  /** Every page except the last must be at least this full (0–1). Default 0.5. */
  minFill?: number;
  scale?: CardTypeScale;
}

/** Heuristic block height (design px) for a content box `width` px wide. */
export function estimateCardBlockHeight(b: CardBlock, width: number, s: CardTypeScale = CARD_TYPE_SCALE): number {
  const textH = (text: string, size: number, line: number, w: number) => estimateLineCount(text, size, w) * size * line;
  switch (b.kind) {
    case 'heading': {
      const size = b.level === 2 ? s.h2Size : s.h3Size;
      return textH(b.text, size, b.level === 2 ? s.h2Line : s.h3Line, width) + s.headingGapTop + s.headingGapBottom;
    }
    case 'paragraph':
      return textH(b.text, s.bodySize, s.bodyLine, width) + s.paraGap;
    case 'list-item':
      return textH(b.text, s.bodySize, s.bodyLine, width - s.listIndent * (b.depth + 1)) + s.listGap;
    case 'quote':
      return textH(b.text, s.quoteSize, s.quoteLine, width - s.quotePadX * 2 - 8) + s.quotePadY * 2 + s.quoteGap;
    case 'math': {
      // KaTeX display math: stacked constructs (fractions, big operators, roots) are ~3.6em tall, each extra row (\\) ~1.6em.
      const tall = /\\(?:d?frac|i*int|oint|sum|prod|sqrt|lim|binom|begin|overset|underset)/.test(b.tex);
      const rows = (b.tex.match(/\\\\/g) ?? []).length;
      return s.mathSize * ((tall ? 3.6 : 1.8) + rows * 1.6) + 48 + s.paraGap;
    }
    case 'image':
      return Math.round(width * 0.66) + s.imageGap;
    case 'code': {
      const perLine = (width - s.codePad * 2 - 64) / (s.codeSize * 0.6);
      const rows = b.lines.reduce((n, l) => n + Math.max(1, Math.ceil((textWidthEm(l) * 1.1) / perLine)), 0);
      return s.codeHeader + s.codePad * 2 + rows * s.codeSize * s.codeLine + s.codeGap;
    }
    case 'table': {
      const size = b.header.length >= 5 ? s.tableSize - 4 : s.tableSize;
      const colW = width / Math.max(1, b.header.length) - s.tableCellPadX * 2;
      const rowH = (r: string[]) =>
        Math.max(...r.map((c) => estimateLineCount(c || ' ', size, colW))) * size * s.tableLine + s.tableCellPadY * 2;
      return rowH(b.header) + b.rows.reduce((n, r) => n + rowH(r), 0) + s.tableGap;
    }
  }
}

function withText(b: CardBlock, text: string, cont: boolean): CardBlock {
  if (b.kind === 'list-item') return { ...b, text, marker: cont ? '' : b.marker };
  if (b.kind === 'paragraph' || b.kind === 'quote') return { ...b, text };
  return b;
}

const INLINE_MARKS = ['**', '==', '~~', '`', '$'] as const;

/**
 * Inline spans (**bold**, ==mark==, ~~del~~, `code`, $math$) still open at the end of `text`,
 * outermost first. Inside `code` / `$math$` other markers do not count; `$` only counts when
 * the whole paragraph has balanced dollars (so a price like "$5" is not treated as math).
 */
export function openInlineMarks(text: string, countDollar = true): string[] {
  const open: string[] = [];
  for (let i = 0; i < text.length; ) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    const top = open[open.length - 1];
    const literal = top === '`' || top === '$';
    const mark = INLINE_MARKS.find((m) => text.startsWith(m, i) && (m !== '$' || countDollar) && (!literal || m === top));
    if (!mark) {
      i++;
      continue;
    }
    if (top === mark) open.pop();
    else open.push(mark);
    i += mark.length;
  }
  return open;
}

/** Splits text at part `k`; spans open across the cut are closed on the head and reopened on the tail. */
function splitAt(parts: string[], k: number, countDollar: boolean): { head: string; tail: string; crossed: boolean } {
  const head = parts.slice(0, k).join('');
  const tail = parts.slice(k).join('');
  const open = openInlineMarks(head, countDollar);
  if (!open.length) return { head, tail, crossed: false };
  return { head: head + [...open].reverse().join(''), tail: open.join('') + tail, crossed: true };
}

/** Splits a block into a head that `fits` and the remaining tail, or null if impossible. */
export function splitCardBlock(
  b: CardBlock,
  fits: (head: CardBlock) => boolean,
  relaxed = false
): [CardBlock, CardBlock] | null {
  if (b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'list-item') {
    let parts = splitSentences(b.text);
    if (parts.length < 2) parts = b.text.split(/(?<=[，,、：:])/).filter(Boolean);
    const countDollar = openInlineMarks(b.text).every((m) => m !== '$');
    // Prefer a cut outside any inline span; only cut through **bold** etc. when nothing else fits,
    // and then close/reopen the markers so neither half shows a bare `**`.
    for (const allowCrossing of [false, true]) {
      for (let k = parts.length - 1; k >= 1; k--) {
        const cut = splitAt(parts, k, countDollar);
        if (cut.crossed && !allowCrossing) continue;
        const head = withText(b, cut.head, false);
        if (fits(head)) return [head, withText(b, cut.tail, true)];
      }
    }
    return null;
  }
  // Short snippets and small tables stay whole unless the page would otherwise be under-filled.
  const keep = relaxed ? 3 : 4;
  if (b.kind === 'code' && b.lines.length >= (relaxed ? 6 : 10)) {
    for (let k = b.lines.length - keep; k >= keep; k--) {
      const head: CardBlock = { ...b, lines: b.lines.slice(0, k) };
      if (fits(head)) return [head, { ...b, lines: b.lines.slice(k), start: (b.start ?? 1) + k }];
    }
    return null;
  }
  const keepRows = relaxed ? 1 : 2;
  if (b.kind === 'table' && b.rows.length >= keepRows * 2) {
    for (let k = b.rows.length - keepRows; k >= keepRows; k--) {
      const head: CardBlock = { ...b, rows: b.rows.slice(0, k) };
      if (fits(head)) return [head, { ...b, rows: b.rows.slice(k) }];
    }
  }
  return null;
}

/**
 * Flows blocks onto fixed-height pages using measured (or estimated) block heights.
 * Rules: blocks are never cut mid-line (text splits only at sentence/row/line boundaries),
 * a heading is never the last block of a page, images are scaled to stay inside the page,
 * and only the last page may fall under `minFill`.
 */
export function paginateCardBlocks(blocks: CardBlock[], opts: PaginateCardOptions): CardPageLayout[] {
  const { pageHeight, measure } = opts;
  const s = opts.scale ?? CARD_TYPE_SCALE;
  const minFill = opts.minFill ?? 0.5;
  const imageCap = pageHeight * s.imageMaxRatio;
  const imageMin = pageHeight * 0.3;
  const pages: CardPageLayout[] = [];
  let cur: PlacedCardBlock[] = [];
  let used = 0;

  const place = (block: CardBlock, height: number, imageMaxHeight?: number) => {
    cur.push(imageMaxHeight === undefined ? { block, height } : { block, height, imageMaxHeight });
    used += height;
  };
  const breakPage = () => {
    const carried: PlacedCardBlock[] = [];
    while (cur.length > 1 && keepsWithNext(cur[cur.length - 1].block)) carried.unshift(cur.pop() as PlacedCardBlock);
    if (cur.length) pages.push({ blocks: cur, used: cur.reduce((n, p) => n + p.height, 0) });
    cur = carried;
    used = carried.reduce((n, p) => n + p.height, 0);
  };

  /** Height that stays on this page if it broke now (trailing keep-with-next blocks move on). */
  const committed = () => {
    let h = used;
    for (let i = cur.length - 1; i > 0 && keepsWithNext(cur[i].block); i--) h -= cur[i].height;
    return h;
  };

  const queue = [...blocks];
  while (queue.length) {
    const block = queue.shift() as CardBlock;
    let h = measure(block);
    if (h <= 0) continue; // e.g. an image that failed to load
    const remaining = pageHeight - used;

    if (block.kind === 'image') {
      const gap = s.imageGap;
      h = Math.min(h, imageCap + gap);
      if (h <= remaining) place(block, h, h - gap);
      // Scale the image into the rest of the page; accept a smaller image if the page would be under-filled.
      else if (used > 0 && remaining >= (committed() < pageHeight * minFill ? pageHeight * 0.12 : imageMin)) {
        place(block, remaining, remaining - gap);
        breakPage();
      } else {
        breakPage();
        h = Math.min(h, pageHeight - used);
        place(block, h, h - gap);
      }
      continue;
    }

    if (h <= remaining) {
      place(block, h);
      continue;
    }

    // Does not fit: try to put a head of it on this page when the page is not yet full enough.
    const worthSplitting = remaining >= pageHeight * 0.08;
    const fitsHere = (head: CardBlock) => measure(head) <= remaining;
    const split =
      worthSplitting && used > 0
        ? splitCardBlock(block, fitsHere) ?? (committed() < pageHeight * minFill ? splitCardBlock(block, fitsHere, true) : null)
        : null;
    if (split) {
      place(split[0], measure(split[0]));
      queue.unshift(split[1]);
      breakPage();
      continue;
    }
    if (used > 0) breakPage();
    const room = pageHeight - used;
    if (h > room) {
      const fresh = splitCardBlock(block, (head) => measure(head) <= room);
      if (fresh) {
        place(fresh[0], measure(fresh[0]));
        queue.unshift(fresh[1]);
        breakPage();
        continue;
      }
    }
    place(block, h);
  }
  if (cur.length) pages.push({ blocks: cur, used: cur.reduce((n, p) => n + p.height, 0) });
  return rebalanceTail(pages, pageHeight, minFill);
}

/** Headings, and short lead-in lines ending with a colon, stay with the block that follows. */
function keepsWithNext(b: CardBlock): boolean {
  if (b.kind === 'heading') return true;
  return b.kind === 'paragraph' && [...b.text].length <= 90 && /[：:]$/.test(b.text);
}

/** Moves trailing blocks of the second-last page onto a near-empty last page. */
function rebalanceTail(pages: CardPageLayout[], pageHeight: number, minFill: number): CardPageLayout[] {
  if (pages.length < 2) return pages;
  const last = pages[pages.length - 1];
  const prev = pages[pages.length - 2];
  while (last.used < pageHeight * 0.3 && prev.blocks.length > 1) {
    // Move the last block plus any heading that would be left orphaned above it.
    let n = 1;
    while (n < prev.blocks.length && keepsWithNext(prev.blocks[prev.blocks.length - 1 - n].block)) n++;
    if (n >= prev.blocks.length) break;
    const movers = prev.blocks.slice(-n);
    const moved = movers.reduce((sum, p) => sum + p.height, 0);
    const prevAfter = prev.used - moved;
    if (prevAfter < pageHeight * Math.max(minFill, 0.6) || last.used + moved > prevAfter) break;
    prev.blocks.splice(-n, n);
    prev.used = prevAfter;
    last.blocks.unshift(...movers);
    last.used += moved;
  }
  return pages;
}
