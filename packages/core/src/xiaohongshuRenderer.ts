export interface XhsCardSection {
  type: 'cover' | 'content' | 'code';
  title: string;
  subtitle?: string;
  bodyLines: string[];
  codeLang?: string;
  tags?: string[];
}

export interface XhsNotePayload {
  title: string;
  captionText: string;
  tags: string[];
  cards: XhsCardSection[];
}

/**
 * Transforms Markdown into structured 3:4 Xiaohongshu visual card models and caption.
 */
export function renderXiaohongshuCards(
  markdown: string,
  fallbackTitle = '技术笔记'
): XhsNotePayload {
  let title = fallbackTitle;
  const tags: string[] = ['技术笔记', '前端开发', '编程日常'];

  // Frontmatter parsing
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let cleanMd = markdown;
  if (fmMatch) {
    cleanMd = markdown.slice(fmMatch[0].length);
    const lines = fmMatch[1].split(/\r?\n/);
    for (const l of lines) {
      const titleMatch = l.match(/^title:\s*(.+)$/i);
      if (titleMatch) title = titleMatch[1].replace(/^["']|["']$/g, '').trim();
      const tagsMatch = l.match(/^tags:\s*\[(.*)\]/i);
      if (tagsMatch) {
        const parsed = tagsMatch[1]
          .split(',')
          .map((t) => t.replace(/^["']|["']$/g, '').trim())
          .filter(Boolean);
        if (parsed.length > 0) tags.push(...parsed);
      }
    }
  }

  const lines = cleanMd.split(/\r?\n/);
  const cards: XhsCardSection[] = [];

  // Card 1: Cover Card
  cards.push({
    type: 'cover',
    title,
    subtitle: 'Vmark 极客排版与发布指南',
    bodyLines: ['⚡️ 纯本地 Markdown 一键生成', '🎯 全平台自适应高保真排版'],
    tags: Array.from(new Set(tags)),
  });

  // Body Cards & Code Cards
  let currentCard: XhsCardSection = {
    type: 'content',
    title: '核心内容概要',
    bodyLines: [],
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
        title: `代码实现 (${codeLang || 'Snippet'})`,
        bodyLines: codeBuffer.slice(0, 18), // keep within single 3:4 card height
        codeLang: codeLang || 'typescript',
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
      if (currentCard.bodyLines.length > 0) {
        cards.push(currentCard);
      }
      currentCard = {
        type: 'content',
        title: hMatch[1].trim(),
        bodyLines: [],
      };
      continue;
    }

    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('![')) {
      currentCard.bodyLines.push(trimmed.replace(/^[-*]\s+/, '• '));
      if (currentCard.bodyLines.length >= 6) {
        cards.push(currentCard);
        currentCard = {
          type: 'content',
          title: `${currentCard.title} (续)`,
          bodyLines: [],
        };
      }
    }
  }

  if (currentCard.bodyLines.length > 0) {
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
  const hashTagStr = Array.from(new Set(tags))
    .slice(0, 6)
    .map((t) => `#${t.replace(/\s+/g, '')}`)
    .join(' ');

  const captionText = `${title}\n\n${shortSummary}\n\n${hashTagStr}`;

  return {
    title,
    captionText,
    tags: Array.from(new Set(tags)),
    cards: cards.slice(0, 18), // Xiaohongshu allows max 18 images
  };
}
