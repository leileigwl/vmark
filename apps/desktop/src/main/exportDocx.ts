import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      runs.push(new TextRun(text.slice(lastIdx, match.index)));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Menlo', size: 20 }));
    }
    lastIdx = match.index + token.length;
  }
  if (lastIdx < text.length) {
    runs.push(new TextRun(text.slice(lastIdx)));
  }
  return runs.length > 0 ? runs : [new TextRun(text)];
}

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/**
 * Converts Markdown content into a valid OOXML `.docx` binary buffer using `docx`.
 */
export async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const children: Array<Paragraph | Table> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      children.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: 'F4F6F8' },
          border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: 'D0D7DE' },
          },
          spacing: { before: 120, after: 120 },
          children: codeLines.flatMap((cl, idx) =>
            idx === 0
              ? [new TextRun({ text: cl, font: 'Menlo', size: 19 })]
              : [new TextRun({ text: cl, font: 'Menlo', size: 19, break: 1 })]
          ),
        })
      );
      continue;
    }

    // Markdown table
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|/.test(lines[i + 1].trim())) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsedRows = tableLines
        .filter((_, idx) => idx !== 1)
        .map((rowStr) =>
          rowStr
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim())
        );
      if (parsedRows.length > 0) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: parsedRows.map(
              (cells, rIdx) =>
                new TableRow({
                  children: cells.map(
                    (cellText) =>
                      new TableCell({
                        shading: rIdx === 0 ? { type: ShadingType.CLEAR, fill: 'F0F4F8' } : undefined,
                        children: [
                          new Paragraph({
                            children: parseInlineRuns(cellText),
                          }),
                        ],
                      })
                  ),
                })
            ),
          })
        );
      }
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D7DE' } },
          spacing: { before: 160, after: 160 },
        })
      );
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      children.push(
        new Paragraph({
          heading: HEADING_MAP[level] ?? HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 },
          children: parseInlineRuns(headingMatch[2]),
        })
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '007AFF' } },
          spacing: { before: 80, after: 80 },
          children: parseInlineRuns(line.trimStart().slice(2)),
        })
      );
      i++;
      continue;
    }

    // Bullet / task list
    const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (listMatch) {
      const text = listMatch[1]
        .replace(/^\[ \]\s*/, '☐ ')
        .replace(/^\[x\]\s*/i, '☑ ');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(text),
        })
      );
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }));
      i++;
      continue;
    }

    // Normal paragraph
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: parseInlineRuns(line),
      })
    );
    i++;
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
