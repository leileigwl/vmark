import { GENRE_META, type ContentGenre, type PlatformCoverRatio } from './socialCardThemes.ts';

export type UgcCoverTemplate =
  | 'ios-memo'
  | 'minimalist-magazine'
  | 'blank'
  | 'editorial-magazine'
  | 'ugc-big-type'
  | 'travel-postcard'
  | 'tech-blueprint';

export interface XhsCardSection {
  type: 'cover' | 'content' | 'code';
  title: string;
  subtitle?: string;
  bodyLines: string[];
  quote?: string;
  closingQuote?: string;
  takeaway?: string;
  codeLang?: string;
  tags?: string[];
  genre?: ContentGenre;
  coverImage?: string;
  coverTemplate?: UgcCoverTemplate;
}

export interface XhsNotePayload {
  title: string;
  captionText: string;
  tags: string[];
  genre: ContentGenre;
  coverImage?: string;
  coverRatio: PlatformCoverRatio;
  coverTemplate: UgcCoverTemplate;
  cards: XhsCardSection[];
}

export interface RenderXiaohongshuOptions {
  fallbackTitle?: string;
  genre?: ContentGenre;
  coverImage?: string;
  coverRatio?: PlatformCoverRatio;
  coverTemplate?: UgcCoverTemplate;
}

/** Detects article genre by scoring title/tags (high weight) and markdown body features. */
export function detectArticleGenre(markdown: string, title = '', tags: string[] = []): ContentGenre {
  const headerContext = `${title} ${tags.join(' ')}`.toLowerCase();
  const bodyContext = markdown.slice(0, 1500).toLowerCase();

  if (
    /```|~~~/.test(markdown) ||
    /typescript|javascript|python|rust|架构|算法|前端|后端|源码|组件|协议|api|docker|极客|工程/i.test(
      headerContext
    )
  ) {
    return 'tech';
  }

  if (
    /旅行|游记|漫游|行程|景点|民宿|航班|徒步|露营|攻略|京都|大理|川西|海岛|步径|古寺|city\s*walk|travel|trip/i.test(
      headerContext
    )
  ) {
    return 'travel';
  }

  if (/读书|书单|阅读|书评|摘抄|札记|book|reading/i.test(headerContext)) {
    return 'reading';
  }

  if (/旅行|游记|漫游|行程|景点|民宿|徒步|露营|city\s*walk|Day\s*\d/i.test(bodyContext)) {
    return 'travel';
  }
  if (/读书|书单|书评|作者|章节|阅读笔记/i.test(bodyContext)) {
    return 'reading';
  }
  if (/架构|算法|前端|后端|源码|接口|编译|部署/i.test(bodyContext)) {
    return 'tech';
  }
  return 'essay';
}

function defaultCoverTemplateForGenre(genre: ContentGenre): UgcCoverTemplate {
  switch (genre) {
    case 'travel':
      return 'travel-postcard';
    case 'tech':
      return 'tech-blueprint';
    case 'reading':
      return 'editorial-magazine';
    default:
      return 'ugc-big-type';
  }
}

/** Strips all inline markdown syntax (used for plain-text titles & captions). */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** Preserves **bold**, ==highlight==, *italic*, ~~del~~, and `code` for xhs-textcard inline rendering. */
function preserveRichInlineMarkdown(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

function isTableRowLine(trimmed: string): boolean {
  return trimmed.includes('|') && /^\|?.*\|.*\|?$/.test(trimmed);
}

function isTableSeparatorLine(trimmed: string): boolean {
  return (
    trimmed.includes('|') &&
    trimmed.includes('-') &&
    /^\|?(?:\s*:?-{2,}:?\s*\|)+\s*(?::?-{2,}:?\s*\|?)?$/.test(trimmed)
  );
}

function parseTableCells(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Strips horizontal rules (`---`, `***`, `___`) and transforms GFM Markdown tables
 * into clean structured bullet lines outside fenced code blocks.
 */
function normalizeMarkdownTablesAndRules(rawMarkdown: string): string {
  const lines = rawMarkdown.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let codeFenceChar = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch) {
      if (!inCode) {
        inCode = true;
        codeFenceChar = fenceMatch[1][0];
      } else if (trimmed.startsWith(codeFenceChar.repeat(3))) {
        inCode = false;
        codeFenceChar = '';
      }
      out.push(line);
      continue;
    }

    if (inCode) {
      out.push(line);
      continue;
    }

    // Drop standalone horizontal rules (---, ***, ___) so cards never show raw "---"
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      continue;
    }

    // Detect GFM table header + separator row
    if (
      isTableRowLine(trimmed) &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1].trim())
    ) {
      const headers = parseTableCells(trimmed).map((h) => stripInlineMarkdown(h));
      let j = i + 2;
      while (j < lines.length && isTableRowLine(lines[j].trim())) {
        const rowTrimmed = lines[j].trim();
        if (!isTableSeparatorLine(rowTrimmed)) {
          const cells = parseTableCells(rowTrimmed);
          if (cells.some(Boolean)) {
            if (cells.length === 1) {
              out.push(`- ${cells[0]}`);
            } else {
              const rawLabel = cells[0].replace(/^\*\*|\*\*$/g, '').trim();
              if (cells.length === 2) {
                out.push(rawLabel ? `- **${rawLabel}**：${cells[1]}` : `- ${cells[1]}`);
              } else {
                const pairs = cells
                  .slice(1)
                  .map((val, colIdx) => {
                    if (!val) return '';
                    const colHeader = headers[colIdx + 1];
                    return colHeader ? `${colHeader}：${val}` : val;
                  })
                  .filter(Boolean)
                  .join(' · ');
                out.push(rawLabel ? `- **${rawLabel}**：${pairs}` : `- ${pairs}`);
              }
            }
          }
        }
        j++;
      }
      i = j - 1;
      continue;
    }

    // Drop orphan table separator lines
    if (isTableSeparatorLine(trimmed)) {
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

/**
 * Transforms Markdown into continuous flowing 3:4 / 2:3 Xiaohongshu & Douyin visual cards
 * modeled after xhs-textcard.site/editor (Apple Notes, Minimalist Magazine, Blank, etc.).
 */
export function renderXiaohongshuCards(
  markdown: string,
  fallbackTitleOrOptions: string | RenderXiaohongshuOptions = '个人随笔'
): XhsNotePayload {
  const opts: RenderXiaohongshuOptions =
    typeof fallbackTitleOrOptions === 'string'
      ? { fallbackTitle: fallbackTitleOrOptions }
      : fallbackTitleOrOptions;

  let title = opts.fallbackTitle || '个人随笔';
  const explicitTags: string[] = [];
  let fmCoverImage = opts.coverImage;
  let fmSubtitle = '';

  // Frontmatter parsing
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let cleanMd = markdown;
  if (fmMatch) {
    cleanMd = markdown.slice(fmMatch[0].length);
    const fmLines = fmMatch[1].split(/\r?\n/);
    for (const l of fmLines) {
      const titleMatch = l.match(/^title:\s*(.+)$/i);
      if (titleMatch) title = titleMatch[1].replace(/^["']|["']$/g, '').trim();

      const subMatch = l.match(/^(?:subtitle|description|summary):\s*(.+)$/i);
      if (subMatch) fmSubtitle = subMatch[1].replace(/^["']|["']$/g, '').trim();

      const coverMatch = l.match(/^(?:cover|coverImage|banner):\s*(.+)$/i);
      if (coverMatch && !fmCoverImage) {
        fmCoverImage = coverMatch[1].replace(/^["']|["']$/g, '').trim();
      }

      const tagsMatch = l.match(/^tags:\s*\[(.*)\]/i);
      if (tagsMatch) {
        const parsed = tagsMatch[1]
          .split(',')
          .map((t) => t.replace(/^["']|["']$/g, '').trim())
          .filter(Boolean);
        explicitTags.push(...parsed);
      }
    }
  }

  // Extract first H1 if title was not set by frontmatter
  const firstH1Match = cleanMd.match(/^#\s+(.+)$/m);
  if (firstH1Match && (!opts.fallbackTitle || title === opts.fallbackTitle)) {
    title = stripInlineMarkdown(firstH1Match[1]);
  }

  // Extract inline hashtags like #旅行日记 #生活碎片
  const inlineHashtags = [
    ...cleanMd.matchAll(/(?:^|\s)#([\u4e00-\u9fa5a-zA-Z0-9_-]{2,10})(?=\s|$)/g),
  ].map((m) => m[1]);

  if (!fmCoverImage) {
    const firstImgMatch = cleanMd.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
    if (firstImgMatch) {
      fmCoverImage = firstImgMatch[1].trim();
    }
  }

  const normalizedMd = normalizeMarkdownTablesAndRules(cleanMd);
  const genre =
    opts.genre || detectArticleGenre(cleanMd, title, [...explicitTags, ...inlineHashtags]);
  const genreConfig = GENRE_META[genre];
  const mergedTags = Array.from(
    new Set([...explicitTags, ...inlineHashtags, ...genreConfig.defaultTags])
  ).slice(0, 7);

  const coverRatio: PlatformCoverRatio = opts.coverRatio || '3:4';
  const coverTemplate: UgcCoverTemplate =
    opts.coverTemplate || defaultCoverTemplateForGenre(genre);

  const lines = normalizedMd.split(/\r?\n/);
  const headings: string[] = [];
  const quotes: string[] = [];
  const richParagraphs: string[] = [];
  const preHeadingParagraphs: string[] = [];

  let scanCode = false;
  let passedFirstSubheading = false;
  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (/^(`{3,}|~{3,})/.test(t)) {
      scanCode = !scanCode;
      continue;
    }
    if (scanCode || !t) continue;
    const h = t.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      const hText = stripInlineMarkdown(h[1]);
      if (hText !== title) {
        headings.push(hText);
        passedFirstSubheading = true;
      }
      continue;
    }
    if (t.startsWith('>')) {
      const q = preserveRichInlineMarkdown(t.replace(/^>\s*(\[![A-Z]+\])?\s*/, ''));
      if (q) quotes.push(q);
      continue;
    }
    if (!t.startsWith('#') && !t.startsWith('![') && t.length >= 6) {
      const formatted = preserveRichInlineMarkdown(t.replace(/^[-*]\s+/, '• '));
      richParagraphs.push(formatted);
      if (!passedFirstSubheading) {
        preHeadingParagraphs.push(formatted);
      }
    }
  }

  // Page 1 (Cover / First Page of Flowing Note)
  const firstPageLines: string[] =
    preHeadingParagraphs.length > 0
      ? preHeadingParagraphs.slice(0, 3)
      : richParagraphs.slice(0, 3);
  if (firstPageLines.length === 0 && headings.length > 0) {
    firstPageLines.push(...headings.slice(0, 3));
  }
  if (firstPageLines.length === 0) {
    firstPageLines.push(
      '每一段保持短一点，两个回车分隔段落。系统会优先在段落之间自动分页，让阅读节奏更自然。',
      '**加粗**适合普通关键词，它只改变字重，颜色会和正文一致。',
      '==高亮==适合真正需要停顿的关键信息，如核心结论、路线节点或转折点。'
    );
  }

  const cards: XhsCardSection[] = [];
  cards.push({
    type: 'cover',
    title,
    subtitle: fmSubtitle || headings[0] || `${genreConfig.badge}`,
    bodyLines: firstPageLines,
    quote: quotes[0] || fmSubtitle,
    closingQuote: quotes[1],
    tags: mergedTags,
    genre,
    coverImage: fmCoverImage,
    coverTemplate,
  });

  // Subsequent flowing pages & code cards
  let currentCard: XhsCardSection = {
    type: 'content',
    title: `${title} · 导读`,
    bodyLines: [],
    genre,
  };
  let seenSubheading = false;
  const coverLineSet = new Set(firstPageLines);

  let inCode = false;
  let codeLang = '';
  let codeMarker = '';
  let codeBuffer: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    const codeMatch = trimmedLine.match(/^(`{3,}|~{3,})(.*)$/);
    if (codeMatch && !inCode) {
      inCode = true;
      codeMarker = codeMatch[1];
      const info = codeMatch[2].trim();
      const rawLang = info.split(/\s+/)[0] || '';
      codeLang = rawLang.toLowerCase().replace(/[^a-zA-Z0-9_+#.-]/g, '');
      codeBuffer = [];
      continue;
    }
    if (codeMarker && trimmedLine.startsWith(codeMarker[0].repeat(codeMarker.length)) && inCode) {
      inCode = false;
      cards.push({
        type: 'code',
        title: seenSubheading ? currentCard.title : `代码实现 (${codeLang || 'Snippet'})`,
        bodyLines: codeBuffer.slice(0, 18),
        codeLang: codeLang || 'typescript',
        genre,
      });
      codeBuffer = [];
      codeLang = '';
      codeMarker = '';
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const hMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (hMatch) {
      const hTitle = stripInlineMarkdown(hMatch[1]);
      if (hTitle === title) continue;
      seenSubheading = true;
      if (currentCard.bodyLines.length > 0) {
        cards.push(currentCard);
      }
      currentCard = {
        type: 'content',
        title: hTitle,
        bodyLines: [],
        genre,
      };
      continue;
    }

    if (trimmedLine.startsWith('>')) {
      const qText = preserveRichInlineMarkdown(trimmedLine.replace(/^>\s*(\[![A-Z]+\])?\s*/, ''));
      if (qText && qText !== quotes[0]) {
        if (!currentCard.quote) {
          currentCard.quote = qText;
        } else if (!currentCard.closingQuote) {
          currentCard.closingQuote = qText;
        } else {
          currentCard.bodyLines.push(`> ${qText}`);
        }
      }
      continue;
    }

    if (trimmedLine && !trimmedLine.startsWith('![')) {
      const richLine = preserveRichInlineMarkdown(trimmedLine.replace(/^[-*]\s+/, '• '));
      if (!seenSubheading && coverLineSet.has(richLine)) {
        continue;
      }
      if (richLine) {
        currentCard.bodyLines.push(richLine);
        if (currentCard.bodyLines.length >= 4) {
          cards.push(currentCard);
          currentCard = {
            type: 'content',
            title: `${currentCard.title.replace(/ \(续\)$/, '')} (续)`,
            bodyLines: [],
            genre,
          };
        }
      }
    }
  }

  if (currentCard.bodyLines.length > 0) {
    cards.push(currentCard);
  }

  // Plain-text caption
  const plainText = normalizedMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const shortSummary = plainText.length > 600 ? `${plainText.slice(0, 599)}…` : plainText;
  const hashTagStr = mergedTags
    .slice(0, 6)
    .map((t) => `#${t.replace(/\s+/g, '')}`)
    .join(' ');

  const captionText = `${title}\n\n${shortSummary}\n\n${hashTagStr}`;

  return {
    title,
    captionText,
    tags: mergedTags,
    genre,
    coverImage: fmCoverImage,
    coverRatio,
    coverTemplate,
    cards: cards.slice(0, 18),
  };
}
