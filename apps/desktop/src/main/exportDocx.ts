import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow } from 'electron';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
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
const BODY_SIZE = 21; // 10.5pt
const CODE_SIZE = 19; // 9.5pt

interface RenderedFormula {
  data: Buffer;
  width: number;
  height: number;
}

function findKatexDir(): string | null {
  const candidates = [
    path.join(__dirname, '../renderer/vditor/dist/js/katex'),
    path.join(process.cwd(), 'src/renderer/public/vditor/dist/js/katex'),
    path.join(process.cwd(), 'apps/desktop/src/renderer/public/vditor/dist/js/katex'),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, 'katex.min.js'))) ?? null;
}

/**
 * Renders LaTeX formulas into crisp 2x-DPI PNG buffers using local KaTeX inside
 * a single hidden Electron BrowserWindow so Word/WPS/Pages display real equations.
 */
async function renderLatexFormulasToPng(formulas: string[]): Promise<Array<RenderedFormula | null>> {
  if (formulas.length === 0) return [];
  const katexDir = findKatexDir();
  if (!katexDir) return formulas.map(() => null);

  const katexCssUrl = pathToFileURL(path.join(katexDir, 'katex.min.css')).toString();
  const katexJsUrl = pathToFileURL(path.join(katexDir, 'katex.min.js')).toString();

  const win = new BrowserWindow({
    show: false,
    width: 960,
    height: 420,
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="${katexCssUrl}" />
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; }
    #wrap { display: inline-block; padding: 14px 20px; color: #1f2328; font-size: 20px; }
  </style>
  <script src="${katexJsUrl}"></script>
</head>
<body>
  <div id="wrap"></div>
</body>
</html>`;
    const tmpHtml = path.join(path.dirname(katexDir), '_vmark_katex_export.html');
    await fs.writeFile(tmpHtml, html, 'utf-8');
    try {
      await win.loadFile(tmpHtml);
    } finally {
      await fs.unlink(tmpHtml).catch(() => {});
    }

    const results: Array<RenderedFormula | null> = [];
    for (const tex of formulas) {
      const rect = await win.webContents.executeJavaScript(`
        (() => {
          const wrap = document.getElementById('wrap');
          wrap.innerHTML = '';
          try {
            window.katex.render(${JSON.stringify(tex)}, wrap, { displayMode: true, throwOnError: false });
            const r = wrap.getBoundingClientRect();
            return { x: 0, y: 0, width: Math.ceil(r.width), height: Math.ceil(r.height) };
          } catch {
            return null;
          }
        })();
      `);
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        results.push(null);
        continue;
      }
      const img = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: Math.min(940, rect.width),
        height: Math.min(400, rect.height),
      });
      const png = img.toPNG();
      // Scale down slightly for 10.5pt Word document aesthetics (~75% of 20px render)
      const maxDocWidth = 520;
      const targetW = Math.min(maxDocWidth, Math.round(rect.width * 0.72));
      const targetH = Math.max(18, Math.round((rect.height * targetW) / rect.width));
      results.push({ data: png, width: targetW, height: targetH });
    }
    return results;
  } catch {
    return formulas.map(() => null);
  } finally {
    win.destroy();
  }
}

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
  1: { level: HeadingLevel.HEADING_1, size: 36, color: '1F2328' },
  2: { level: HeadingLevel.HEADING_2, size: 30, color: '1F2328' },
  3: { level: HeadingLevel.HEADING_3, size: 26, color: '1F2328' },
  4: { level: HeadingLevel.HEADING_4, size: 23, color: '1F2328' },
  5: { level: HeadingLevel.HEADING_5, size: 21, color: '1F2328' },
  6: { level: HeadingLevel.HEADING_6, size: 20, color: '57606A' },
};

/**
 * Converts Markdown content into a clean, valid OOXML `.docx` binary buffer using `docx`,
 * rendering LaTeX/Math blocks as crisp KaTeX PNG equations.
 */
export async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  // First pass: collect all LaTeX / $$...$$ formulas so we render them in one batch
  const formulaList: string[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const t = lines[idx].trim();
    if (/^```(latex|math|tex)\b/i.test(t)) {
      const buf: string[] = [];
      idx++;
      while (idx < lines.length && !/^```/.test(lines[idx].trim())) {
        buf.push(lines[idx]);
        idx++;
      }
      const tex = buf.join('\n').trim();
      if (tex) formulaList.push(tex);
    } else if (t === '$$') {
      const buf: string[] = [];
      idx++;
      while (idx < lines.length && lines[idx].trim() !== '$$') {
        buf.push(lines[idx]);
        idx++;
      }
      const tex = buf.join('\n').trim();
      if (tex) formulaList.push(tex);
    } else if (/^\$\$.+\$\$$/.test(t) && t.length > 4) {
      formulaList.push(t.slice(2, -2).trim());
    }
  }

  const renderedFormulas = await renderLatexFormulasToPng(formulaList);
  let formulaCursor = 0;

  const makeFormulaParagraph = (rawTex: string): Paragraph => {
    const rendered = renderedFormulas[formulaCursor++];
    if (rendered) {
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 140, after: 140 },
        children: [
          new ImageRun({
            type: 'png',
            data: rendered.data,
            transformation: { width: rendered.width, height: rendered.height },
          }),
        ],
      });
    }
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.CLEAR, fill: 'F6F8FA' },
      spacing: { before: 140, after: 140 },
      children: [new TextRun({ text: rawTex, font: CODE_FONT, size: CODE_SIZE, noProof: true })],
    });
  };

  const children: Array<Paragraph | Table> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^<\/?(details|summary)[^>]*>$/i.test(trimmed)) {
      i++;
      continue;
    }

    // $$ ... $$ block
    if (trimmed === '$$') {
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') {
        buf.push(lines[i]);
        i++;
      }
      i++;
      const tex = buf.join('\n').trim();
      if (tex) children.push(makeFormulaParagraph(tex));
      continue;
    }
    if (/^\$\$.+\$\$$/.test(trimmed) && trimmed.length > 4) {
      children.push(makeFormulaParagraph(trimmed.slice(2, -2).trim()));
      i++;
      continue;
    }

    // Fenced code or LaTeX block
    if (/^```/.test(trimmed)) {
      const lang = trimmed.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const body = codeLines.join('\n').trim();
      if (body.length > 0) {
        if (lang === 'latex' || lang === 'math' || lang === 'tex') {
          children.push(makeFormulaParagraph(body));
        } else {
          children.push(
            new Paragraph({
              shading: { type: ShadingType.CLEAR, fill: 'F6F8FA' },
              border: {
                left: { style: BorderStyle.SINGLE, size: 8, color: 'D0D7DE' },
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
