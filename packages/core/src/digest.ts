/** Extracts clean plain-text digest from Markdown body up to `maxLength` characters. */
export function extractPlainDigest(markdown: string, maxLength: number): string {
  const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const plain = withoutFrontmatter
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
