import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
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

type InlineChild = TextRun | ExternalHyperlink;

const BODY_FONT = 'PingFang SC';
const CODE_FONT = 'Menlo';
const BODY_SIZE = 21; // 10.5pt (half-points)
const CODE_SIZE = 19; // 9.5pt (half-points)

function parseInlineRuns(text: string): InlineChild[] {
  const cleaned = text.replace(/<\/?(details|summary)[^>]*>/gi, '').trim();
  const runs: InlineChild[] = [];
  const tokenRe = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(cleaned)) !== null) {
    if (match.index > lastIdx) {
      runs.push(new TextRun({ text: cleaned.slice(lastIdx, match.index), font: BODY_FONT, size: BODY_SIZE }));
    }
    const token = match[0];
    if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const splitIdx = token.indexOf('](');
      const label = token.slice(1, splitIdx);
      const url = token.slice(splitIdx + 2, -1);
      if (/^https?:\/\//i.test(url)) {
        runs.push(
          new ExternalHyperlink({
            link: url,
            children: [
              new TextRun({
                text: label,
                font: BODY_FONT,
                size: BODY_SIZE,
                color: '0969DA',
                underline: {},
              }),
            ],
          })
        );
      } else {
        runs.push(new TextRun({ text: label, font: BODY_FONT, size: BODY_SIZE, color: '0969DA' }));
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), font: BODY_FONT, size: BODY_SIZE, bold: true }));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: BODY_FONT, size: BODY_SIZE, italics: true }));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          font: CODE_FONT,
          size: CODE_SIZE,
          noProof: true,
          shading: { type: ShadingType.CLEAR, fill: 'F0F3F6' },
        })
      );
    }
    lastIdx = match.index + token.length;
  }
  if (lastIdx < cleaned.length) {
    runs.push(new TextRun({ text: cleaned.slice(lastIdx), font: BODY_FONT, size: BODY_SIZE }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text: cleaned, font: BODY_FONT, size: BODY_SIZE })];
}

const HEADING_STYLES: Record<
  number,
  { level: (typeof HeadingLevel)[keyof typeof HeadingLevel]; size: number; color: string }
> = {
  1: { level: HeadingLevel.HEADING_1, size: 36, color: '1F2328' }, // 18pt
  2: { level: HeadingLevel.HEADING_2, size: 30, color: '1F2328' }, // 15pt
  3: { level: HeadingLevel.HEADING_3, size: 26, color: '1F2328' }, // 13pt
  4: { level: HeadingLevel.HEADING_4, size: 23, color: '1F2328' }, // 11.5pt
  5: { level: HeadingLevel.HEADING_5, size: 21, color: '1F2328' }, // 10.5pt
  6: { level: HeadingLevel.HEADING_6, size: 20, color: '57606A' }, // 10pt
};

/**
 * Converts Markdown content into a clean, valid OOXML `.docx` binary buffer using `docx`.
 */
export async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const children: Array<Paragraph | Table> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^<\/?(details|summary)[^>]*>$/i.test(trimmed)) {
      i++;
      continue;
    }

    // Fenced code / LaTeX block (skip completely empty code blocks so no blank gray stripes appear)
    if (/^```/.test(trimmed)) {
      const lang = trimmed.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      if (codeLines.some((cl) => cl.trim().length > 0)) {
        const isMath = lang === 'latex' || lang === 'math' || lang === 'tex';
        children.push(
          new Paragraph({
            alignment: isMath ? AlignmentType.CENTER : AlignmentType.LEFT,
            shading: { type: ShadingType.CLEAR, fill: 'F6F8FA' },
            border: {
              left: { style: BorderStyle.SINGLE, size: 8, color: isMath ? '0969DA' : 'D0D7DE' },
            },
            spacing: { before: 140, after: 140, line: 300 },
            children: codeLines.flatMap((cl, idx) =>
              idx === 0
                ? [new TextRun({ text: cl, font: CODE_FONT, size: CODE_SIZE, noProof: true })]
                : [new TextRun({ text: cl, font: CODE_FONT, size: CODE_SIZE, noProof: true, break: 1 })]
            ),
          })
        );
      }
      continue;
    }

    // Markdown table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|/.test(lines[i + 1].trim())) {
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
                            spacing: { before: 60, after: 60 },
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
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D7DE' } },
          spacing: { before: 140, after: 140 },
        })
      );
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const style = HEADING_STYLES[level] ?? HEADING_STYLES[1];
      children.push(
        new Paragraph({
          heading: style.level,
          spacing: { before: 220, after: 110 },
          children: [
            new TextRun({
              text: headingMatch[2].replace(/\*\*/g, '').trim(),
              font: BODY_FONT,
              size: style.size,
              bold: true,
              color: style.color,
            }),
          ],
        })
      );
      i++;
      continue;
    }

    // Group contiguous blockquote lines into a single clean callout block
    if (/^\s*>/.test(line)) {
      const quoteRuns: InlineChild[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        const qText = lines[i].replace(/^\s*>\s?/, '').trim();
        if (qText) {
          if (quoteRuns.length > 0) {
            quoteRuns.push(new TextRun({ text: '', break: 1 }));
          }
          quoteRuns.push(...parseInlineRuns(qText));
        }
        i++;
      }
      if (quoteRuns.length > 0) {
        children.push(
          new Paragraph({
            indent: { left: 280 },
            shading: { type: ShadingType.CLEAR, fill: 'F6F9FC' },
            border: { left: { style: BorderStyle.SINGLE, size: 14, color: '0969DA' } },
            spacing: { before: 100, after: 100, line: 340 },
            children: quoteRuns,
          })
        );
      }
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
          spacing: { after: 60, line: 320 },
          children: parseInlineRuns(text),
        })
      );
      i++;
      continue;
    }

    // Empty line
    if (!trimmed) {
      children.push(new Paragraph({ text: '' }));
      i++;
      continue;
    }

    // Normal paragraph
    children.push(
      new Paragraph({
        spacing: { after: 100, line: 340 },
        children: parseInlineRuns(line),
      })
    );
    i++;
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: BODY_FONT,
            size: BODY_SIZE,
            color: '1F2328',
          },
          paragraph: {
            spacing: { line: 340, after: 100 },
          },
        },
      },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
