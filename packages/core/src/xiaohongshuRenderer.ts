import { GENRE_META, getCardContentBox, type ContentGenre, type PlatformCoverRatio } from './socialCardThemes.ts';
import { stripInlineMarkdown } from './socialMarkdownUtils.ts';
import { blockToLine, parseCardBlocks, type CardBlock } from './socialCardBlocks.ts';
import { estimateCardBlockHeight, paginateCardBlocks, type PlacedCardBlock } from './socialCardPaginate.ts';

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
  /** Flowing content blocks placed on this card (content cards only). */
  blocks?: PlacedCardBlock[];
  /** How full the content box is (0–1), from the measured/estimated block heights. */
  fill?: number;
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
  /** Cards the article produced before the limit was applied (cover included). */
  totalCards: number;
  /** Cards cut off by the limit: `totalCards - cards.length`. Never drop silently; show this to the user. */
  droppedCards: number;
}

/** Default per-note card limit (小红书 18 张). Platforms with a different limit pass `maxCards`. */
export const DEFAULT_MAX_SOCIAL_CARDS = 18;

export interface RenderXiaohongshuOptions {
  fallbackTitle?: string;
  genre?: ContentGenre;
  coverImage?: string;
  coverRatio?: PlatformCoverRatio;
  coverTemplate?: UgcCoverTemplate;
  /** Theme whose content box drives pagination (defaults to ios-memo). */
  themeId?: string;
  /** Override the content-box height (design px). */
  pageHeight?: number;
  /** Real rendered block heights (design px, margins included); falls back to an estimate. */
  measure?: (block: CardBlock) => number;
  /** Platform card limit (cover included); defaults to DEFAULT_MAX_SOCIAL_CARDS. */
  maxCards?: number;
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

  const genre =
    opts.genre || detectArticleGenre(cleanMd, title, [...explicitTags, ...inlineHashtags]);
  const genreConfig = GENRE_META[genre];
  const mergedTags = Array.from(
    new Set([...explicitTags, ...inlineHashtags, ...genreConfig.defaultTags])
  ).slice(0, 7);

  const coverRatio: PlatformCoverRatio = opts.coverRatio || '3:4';
  const coverTemplate: UgcCoverTemplate =
    opts.coverTemplate || defaultCoverTemplateForGenre(genre);

  // Hashtag-only lines feed the tags, not the card flow.
  const blocks = parseCardBlocks(cleanMd, { title }).filter(
    (b) => !(b.kind === 'paragraph' && /^(?:#[^\s#]+\s*)+$/.test(b.text))
  );
  const leadQuoteIdx = blocks.findIndex((b) => b.kind === 'quote');
  const firstHeadingIdx = blocks.findIndex((b) => b.kind === 'heading');
  const leadQuote =
    leadQuoteIdx >= 0 && (firstHeadingIdx < 0 || leadQuoteIdx < firstHeadingIdx)
      ? (blocks[leadQuoteIdx] as { text: string }).text
      : undefined;
  const subtitle = fmSubtitle || leadQuote || '';
  // A lead quote promoted to the cover subtitle is not repeated in the flow.
  const flowBlocks = !fmSubtitle && leadQuote ? blocks.filter((_, i) => i !== leadQuoteIdx) : blocks;
  const leadLines = flowBlocks
    .filter((b) => b.kind === 'paragraph')
    .slice(0, 2)
    .map((b) => blockToLine(b));

  const cards: XhsCardSection[] = [
    {
      type: 'cover',
      title,
      subtitle: subtitle || genreConfig.badge,
      bodyLines: leadLines,
      quote: leadQuote || fmSubtitle || undefined,
      tags: mergedTags,
      genre,
      coverImage: fmCoverImage,
      coverTemplate,
    },
  ];

  const box = getCardContentBox(opts.themeId, coverRatio);
  const pageHeight = opts.pageHeight ?? box.height;
  const measure = opts.measure ?? ((b: CardBlock) => estimateCardBlockHeight(b, box.width));
  const pages = paginateCardBlocks(flowBlocks, { pageHeight, measure });
  let section = title;
  for (const page of pages) {
    const firstHeading = page.blocks.find((p) => p.block.kind === 'heading');
    const pageTitle = firstHeading ? blockToLine(firstHeading.block) : section;
    for (const p of page.blocks) if (p.block.kind === 'heading') section = p.block.text;
    const codeBlock = page.blocks.find((p) => p.block.kind === 'code')?.block;
    cards.push({
      type: codeBlock ? 'code' : 'content',
      title: pageTitle,
      bodyLines: page.blocks.map((p) => blockToLine(p.block)).filter(Boolean),
      codeLang: codeBlock && codeBlock.kind === 'code' ? codeBlock.lang || 'text' : undefined,
      genre,
      blocks: page.blocks,
      fill: Math.round((page.used / pageHeight) * 1000) / 1000,
    });
  }

  // Plain-text caption: prose only (no tables, code, or images).
  const prose = flowBlocks
    .filter((b) => b.kind === 'paragraph' || b.kind === 'list-item' || b.kind === 'quote')
    .map((b) => stripInlineMarkdown(blockToLine(b).replace(/^>\s*/, '')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const plainText = [!fmSubtitle && leadQuote ? stripInlineMarkdown(leadQuote) : '', prose].filter(Boolean).join(' ');

  const shortSummary = plainText.length > 600 ? `${plainText.slice(0, 599)}…` : plainText;
  const hashTagStr = mergedTags
    .slice(0, 6)
    .map((t) => `#${t.replace(/\s+/g, '')}`)
    .join(' ');

  const captionText = `${title}\n\n${shortSummary}\n\n${hashTagStr}`;
  const limit = Math.max(0, opts.maxCards ?? DEFAULT_MAX_SOCIAL_CARDS);

  return {
    title,
    captionText,
    tags: mergedTags,
    genre,
    coverImage: fmCoverImage,
    coverRatio,
    coverTemplate,
    cards: cards.slice(0, limit),
    totalCards: cards.length,
    droppedCards: Math.max(0, cards.length - limit),
  };
}
