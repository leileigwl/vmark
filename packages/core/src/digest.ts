const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*(?::?-{2,}:?\s*\|?)?\s*$/;

/** Removes GFM tables (header, separator and body rows): cell text never belongs in a digest. */
function stripMarkdownTables(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) i++;
      i--;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Extracts clean plain-text digest from Markdown body up to `maxLength` characters. */
export function extractPlainDigest(markdown: string, maxLength: number): string {
  const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const plain = stripMarkdownTables(withoutFrontmatter)
    .replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?(\[![A-Z]+\])?\s?/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/[>|#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1)}…`;
}
