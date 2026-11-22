/** Strips all inline markdown syntax (used for plain-text titles & captions). */
export function stripInlineMarkdown(text: string): string {
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
export function preserveRichInlineMarkdown(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}
