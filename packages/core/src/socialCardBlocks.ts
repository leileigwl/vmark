import { preserveRichInlineMarkdown, stripInlineMarkdown } from './socialMarkdownUtils.ts';

/** One atomic (or splittable) unit of card content, in document order. */
export type CardBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list-item'; text: string; marker: string; ordered: boolean; depth: number }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; lines: string[]; start?: number }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'math'; tex: string };

export interface ParseCardBlocksOptions {
  /** Headings equal to the deck title are dropped (they are already on the cover). */
  title?: string;
  /** Optional pre-split of long paragraphs at sentence ends (default: none, the paginator splits). */
  maxParagraphChars?: number;
  /** Optional pre-split of long code blocks (default: none). */
  maxCodeLines?: number;
  /** Optional pre-split of long tables, header repeated (default: none). */
  maxTableRows?: number;
}

const FENCE = /^(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const IMAGE_ONLY = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;
const INLINE_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function isTableRow(t: string): boolean {
  return t.includes('|') && /^\|?.*\|.*\|?$/.test(t);
}

function isTableSeparator(t: string): boolean {
  return t.includes('|') && t.includes('-') && /^\|?(?:\s*:?-{2,}:?\s*\|)+\s*(?::?-{2,}:?\s*\|?)?$/.test(t);
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => preserveRichInlineMarkdown(c.trim()));
}

function joinLines(lines: string[]): string {
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    const cjkSeam = /[\u2E80-\uFFEF]$/.test(acc) || /^[\u2E80-\uFFEF]/.test(line);
    return cjkSeam ? acc + line : `${acc} ${line}`;
  }, '');
}

/** Splits text into sentences, keeping the closing punctuation with each sentence. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？!?；;…]+(?:[。！？!?；;…]+[”’」』）)]*|$)/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function chunkText(text: string, maxChars: number): string[] {
  if (!Number.isFinite(maxChars) || [...text].length <= maxChars) return [text];
  const out: string[] = [];
  let cur = '';
  for (const s of splitSentences(text)) {
    if (cur && [...cur].length + [...s].length > maxChars) {
      out.push(cur);
      cur = s;
    } else {
      cur = joinLines(cur ? [cur, s] : [s]);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isFinite(size)) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Parses Markdown (frontmatter already removed) into an ordered list of card blocks.
 * Tables stay tables, inline images become image blocks, long content is pre-chunked
 * so a page break never needs to cut through a rendered line.
 */
export function parseCardBlocks(markdown: string, opts: ParseCardBlocksOptions = {}): CardBlock[] {
  const maxPara = opts.maxParagraphChars ?? Infinity;
  const maxCode = opts.maxCodeLines ?? Infinity;
  const maxRows = opts.maxTableRows ?? Infinity;
  const title = opts.title ? stripInlineMarkdown(opts.title) : '';
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const blocks: CardBlock[] = [];
  let para: string[] = [];
  let quote: string[] = [];

  const pushText = (text: string, make: (t: string) => CardBlock) => {
    const images = [...text.matchAll(INLINE_IMAGE)];
    const rest = preserveRichInlineMarkdown(text.replace(INLINE_IMAGE, ' ').replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' '));
    if (rest) for (const piece of chunkText(rest, maxPara)) blocks.push(make(piece));
    for (const m of images) blocks.push({ kind: 'image', alt: m[1], src: m[2] });
  };
  const flushPara = () => {
    if (para.length) pushText(joinLines(para), (text) => ({ kind: 'paragraph', text }));
    para = [];
  };
  const flushQuote = () => {
    const text = joinLines(quote.map((q) => q.replace(/^\[![A-Z]+\]\s*/, '')).filter(Boolean));
    if (text) pushText(text, (t) => ({ kind: 'quote', text: t }));
    quote = [];
  };
  const flush = () => {
    flushPara();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const fence = t.match(FENCE);
    if (fence) {
      flush();
      const marker = fence[1];
      const lang = (fence[2].trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z0-9_+#.-]/g, '');
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(marker)) body.push(lines[j++].replace(/\t/g, '  '));
      i = j;
      while (body.length && !body[body.length - 1].trim()) body.pop();
      if (body.length) chunk(body, maxCode).forEach((part, k) => blocks.push(k ? { kind: 'code', lang, lines: part, start: k * maxCode + 1 } : { kind: 'code', lang, lines: part }));
      continue;
    }
    if (t === '$$' || (t.startsWith('$$') && t.endsWith('$$') && t.length > 4)) {
      flush();
      if (t !== '$$') {
        blocks.push({ kind: 'math', tex: t.slice(2, -2).trim() });
        continue;
      }
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '$$') body.push(lines[j++].trim());
      i = j;
      if (body.length) blocks.push({ kind: 'math', tex: body.join(' ') });
      continue;
    }
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith('>')) {
      flushPara();
      quote.push(t.replace(/^>\s?/, '').trim());
      continue;
    }
    flushQuote();
    if (HR.test(t)) {
      flushPara();
      continue;
    }
    const h = t.match(HEADING);
    if (h) {
      flushPara();
      const text = stripInlineMarkdown(h[2]);
      if (text && text !== title) blocks.push({ kind: 'heading', level: h[1].length <= 2 ? 2 : 3, text });
      continue;
    }
    if (isTableRow(t) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      flushPara();
      const header = cells(t);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j].trim())) {
        const r = cells(lines[j]);
        if (r.some(Boolean)) rows.push(header.map((_, k) => r[k] ?? ''));
        j++;
      }
      i = j - 1;
      for (const part of chunk(rows, maxRows)) blocks.push({ kind: 'table', header, rows: part });
      continue;
    }
    const img = t.match(IMAGE_ONLY);
    if (img) {
      flushPara();
      blocks.push({ kind: 'image', alt: img[1], src: img[2] });
      continue;
    }
    const li = raw.match(LIST);
    if (li) {
      flushPara();
      const ordered = /\d/.test(li[2]);
      const depth = Math.min(2, Math.floor(li[1].replace(/\t/g, '  ').length / 2));
      const text = li[3].replace(/^\[( |x|X)\]\s+/, (m) => (/x/i.test(m) ? '☑ ' : '☐ '));
      const marker = ordered ? li[2].replace(')', '.') : '•';
      pushText(text, (tx) => ({ kind: 'list-item', text: tx, marker, ordered, depth }));
      continue;
    }
    // A wrapped continuation of the previous list item.
    const prev = blocks[blocks.length - 1];
    if (!para.length && prev && prev.kind === 'list-item' && /^\s{2,}/.test(raw)) {
      prev.text = joinLines([prev.text, preserveRichInlineMarkdown(t)]);
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

/** Flattens a block to a single plain line (legacy `bodyLines` and captions). */
export function blockToLine(b: CardBlock): string {
  switch (b.kind) {
    case 'heading':
      return b.text;
    case 'paragraph':
      return b.text;
    case 'list-item':
      return `${b.ordered ? b.marker : '•'} ${b.text}`;
    case 'quote':
      return `> ${b.text}`;
    case 'code':
      return b.lines.join('\n');
    case 'image':
      return '';
    case 'math':
      return b.tex;
    case 'table':
      return b.rows
        .map((r) => {
          const label = r[0].replace(/^\*\*|\*\*$/g, '').trim();
          const pairs = r
            .slice(1)
            .map((v, k) => (v ? (b.header[k + 1] ? `${stripInlineMarkdown(b.header[k + 1])}：${v}` : v) : ''))
            .filter(Boolean)
            .join(' · ');
          return label ? `• **${label}**：${pairs}` : `• ${pairs}`;
        })
        .join('\n');
  }
}
