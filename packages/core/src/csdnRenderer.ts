export interface CsdnArticleMeta {
  title: string;
  tags: string[];
  categories: string[];
  digest: string;
  markdown: string;
  imageUrls: string[];
}

export function parseCsdnMarkdown(rawMarkdown: string, fallbackTitle = '未命名文章'): CsdnArticleMeta {
  const imageUrls: string[] = [];
  let title = fallbackTitle;
  const tags: string[] = [];
  const categories: string[] = [];

  let cleanMd = rawMarkdown;

  // Frontmatter parsing
  const fmMatch = rawMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    cleanMd = rawMarkdown.slice(fmMatch[0].length);
    const lines = fmMatch[1].split(/\r?\n/);
    for (const l of lines) {
      const titleMatch = l.match(/^title:\s*(.+)$/i);
      if (titleMatch) title = titleMatch[1].replace(/^["']|["']$/g, '').trim();

      const tagsMatch = l.match(/^tags:\s*\[(.*)\]/i);
      if (tagsMatch) {
        tags.push(...tagsMatch[1].split(',').map((t) => t.replace(/^["']|["']$/g, '').trim()).filter(Boolean));
      }

      const catMatch = l.match(/^categories:\s*\[(.*)\]/i);
      if (catMatch) {
        categories.push(...catMatch[1].split(',').map((c) => c.replace(/^["']|["']$/g, '').trim()).filter(Boolean));
      }
    }
  }

  // Fallback title from first H1 if not in frontmatter
  if (title === fallbackTitle) {
    const h1Match = cleanMd.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1].trim();
    }
  }

  // Collect images
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(cleanMd)) !== null) {
    imageUrls.push(match[2].trim());
  }

  // Digest
  const plain = cleanMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const digest = plain.length > 100 ? `${plain.slice(0, 99)}…` : plain;

  return {
    title,
    tags,
    categories,
    digest,
    markdown: cleanMd.trim(),
    imageUrls,
  };
}
