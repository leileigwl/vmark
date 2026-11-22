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
export function normalizeMarkdownTablesAndRules(rawMarkdown: string): string {
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
