import { GENRE_META, type ContentGenre, type PlatformCoverRatio } from './socialCardThemes.ts';

export type UgcCoverTemplate =
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

  // 1. Fenced code block or explicit tech title/tags -> tech
  if (
    /```|~~~/.test(markdown) ||
    /typescript|javascript|python|rust|架构|算法|前端|后端|源码|组件|协议|api|docker|极客|工程/i.test(
      headerContext
    )
  ) {
    return 'tech';
  }

  // 2. Travel title/tags -> travel
  if (
    /旅行|游记|漫游|行程|景点|民宿|航班|徒步|露营|攻略|京都|大理|川西|海岛|步径|古寺|city\s*walk|travel|trip/i.test(
      headerContext
    )
  ) {
    return 'travel';
  }

  // 3. Reading title/tags -> reading
  if (/读书|书单|阅读|书评|摘抄|札记|book|reading/i.test(headerContext)) {
    return 'reading';
  }

  // 4. Fallback body heuristics
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

function cleanMarkdownInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/**
 * Transforms Markdown into structured 3:4 Xiaohongshu / Douyin visual card models and caption.
 * Adapts to personal essays, travel diaries, book notes, and engineering tutorials.
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
    title = cleanMarkdownInline(firstH1Match[1]);
  }

  // Extract inline hashtags like #旅行日记 #生活碎片 (not headings)
  const inlineHashtags = [...cleanMd.matchAll(/(?:^|\s)#([\u4e00-\u9fa5a-zA-Z0-9_-]{2,10})(?=\s|$)/g)].map(
    (m) => m[1]
  );

  // Extract first markdown image if no explicit coverImage was set
  if (!fmCoverImage) {
    const firstImgMatch = cleanMd.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
    if (firstImgMatch) {
      fmCoverImage = firstImgMatch[1].trim();
    }
  }

  const genre = opts.genre || detectArticleGenre(cleanMd, title, [...explicitTags, ...inlineHashtags]);
  const genreConfig = GENRE_META[genre];
  const mergedTags = Array.from(
    new Set([...explicitTags, ...inlineHashtags, ...genreConfig.defaultTags])
  ).slice(0, 7);

  const coverRatio: PlatformCoverRatio = opts.coverRatio || '3:4';
  const coverTemplate: UgcCoverTemplate =
    opts.coverTemplate || defaultCoverTemplateForGenre(genre);

  const lines = cleanMd.split(/\r?\n/);
  const headings: string[] = [];
  const quotes: string[] = [];
  const leadParagraphs: string[] = [];

  // Pre-scan for real article summary lines, headings, and pull quotes
  let scanCode = false;
  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (/^(`{3,}|~{3,})/.test(t)) {
      scanCode = !scanCode;
      continue;
    }
    if (scanCode || !t) continue;
    const h = t.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      const hText = cleanMarkdownInline(h[1]);
      if (hText !== title) headings.push(hText);
      continue;
    }
    if (t.startsWith('>')) {
      const q = cleanMarkdownInline(t.replace(/^>\s*(\[![A-Z]+\])?\s*/, ''));
      if (q) quotes.push(q);
      continue;
    }
    if (!t.startsWith('#') && !t.startsWith('![') && t.length >= 8) {
      leadParagraphs.push(cleanMarkdownInline(t.replace(/^[-*•]\s+/, '')));
    }
  }

  // Build 3-4 authentic Cover Card highlights from headings + key points
  const coverHighlights: string[] = [];
  for (const h of headings.slice(0, 4)) {
    coverHighlights.push(h);
  }
  if (coverHighlights.length < 3) {
    for (const p of leadParagraphs) {
      const shortP = p.length > 42 ? `${p.slice(0, 41)}…` : p;
      if (!coverHighlights.includes(shortP)) {
        coverHighlights.push(shortP);
      }
      if (coverHighlights.length >= 4) break;
    }
  }
  if (coverHighlights.length === 0) {
    coverHighlights.push('记录真实思考与生活切片', '结构化杂志级排版呈现', '全平台自适应封面与卡片');
  }

  const cards: XhsCardSection[] = [];
  cards.push({
    type: 'cover',
    title,
    subtitle: fmSubtitle || `${genreConfig.badge} • ${genreConfig.kicker}`,
    bodyLines: coverHighlights.slice(0, 4),
    quote: quotes[0] || leadParagraphs[0]?.slice(0, 62) || fmSubtitle || title,
    takeaway:
      headings.length > 0
        ? `核心看点：共 ${headings.length} 个章节 · 约 ${Math.max(1, Math.ceil(cleanMd.length / 350))} 分钟读完`
        : `独立创作手记 · 全文精选卡片导览`,
    tags: mergedTags,
    genre,
    coverImage: fmCoverImage,
    coverTemplate,
  });

  // Body Cards & Code Cards
  let currentCard: XhsCardSection = {
    type: 'content',
    title: headings[0] || `${genreConfig.badge}精选`,
    bodyLines: [],
    genre,
  };

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
        title: currentCard.title ? `${currentCard.title}` : `代码实现 (${codeLang || 'Snippet'})`,
        bodyLines: codeBuffer.slice(0, 18),
        codeLang: codeLang || 'typescript',
        takeaway: `语言环境：${(codeLang || 'typescript').toUpperCase()} · 智能不断词对齐`,
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
      const hTitle = cleanMarkdownInline(hMatch[1]);
      if (hTitle === title) continue;
      if (currentCard.bodyLines.length > 0) {
        currentCard.takeaway = currentCard.quote || `${currentCard.title} · 重点摘录`;
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
      const qText = cleanMarkdownInline(trimmedLine.replace(/^>\s*(\[![A-Z]+\])?\s*/, ''));
      // Skip top lead quote if no bodyLines yet (already shown on cover card)
      if (qText && qText !== quotes[0]) {
        if (!currentCard.quote) {
          currentCard.quote = qText;
        } else {
          currentCard.bodyLines.push(`“${qText}”`);
        }
      }
      continue;
    }

    if (trimmedLine && !trimmedLine.startsWith('![')) {
      const cleaned = cleanMarkdownInline(trimmedLine.replace(/^[-*]\s+/, '• '));
      if (cleaned) {
        currentCard.bodyLines.push(cleaned);
        if (currentCard.bodyLines.length >= 5) {
          currentCard.takeaway = currentCard.quote || `${currentCard.title} · 重点摘录`;
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
    currentCard.takeaway = currentCard.quote || `${currentCard.title} · 本节小结`;
    cards.push(currentCard);
  }

  // Caption text (max 800 chars + hashtags)
  const plainText = cleanMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
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
