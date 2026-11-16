import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArticleMeta, OutlineNode } from '@vcat/shared';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'assets', '.obsidian', 'dist', 'out']);
const LOCAL_IMAGE_REGEX = /!\[[^\]]*\]\((?!https?:\/\/|data:)([^)]+)\)/g;

/** Extracts markdown headings (H1-H4) while skipping fenced code blocks. */
export function extractOutline(content: string): OutlineNode[] {
  const lines = content.split(/\r?\n/);
  const outline: OutlineNode[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (match) {
      outline.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
      });
    }
  }
  return outline;
}

/** Counts approximate CJK characters and English words in a markdown document. */
export function countWords(content: string): number {
  const cjk = content.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
  const nonCjk = content
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + nonCjk;
}

/** Builds structured article metadata from raw markdown text. */
export function buildArticleMeta(
  content: string,
  relativePath: string,
  fullPath: string,
  updatedAt: number
): ArticleMeta {
  const outline = extractOutline(content);
  const firstH1 = outline.find((node) => node.level === 1);
  const fallbackTitle = path.basename(relativePath, path.extname(relativePath));
  const localImages = [...content.matchAll(LOCAL_IMAGE_REGEX)];

  return {
    relativePath,
    fullPath,
    title: firstH1?.text || fallbackTitle,
    wordCount: countWords(content),
    localImageCount: localImages.length,
    updatedAt,
    syncRecords: {},
  };
}

/** Recursively scans a workspace directory for markdown articles. */
export async function scanWorkspaceArticles(rootDir: string): Promise<ArticleMeta[]> {
  const results: ArticleMeta[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const [stat, content] = await Promise.all([
          fs.stat(fullPath),
          fs.readFile(fullPath, 'utf-8'),
        ]);
        const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
        results.push(buildArticleMeta(content, relativePath, fullPath, stat.mtimeMs));
      }
    }
  }

  await walk(rootDir);
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

export type TableEditAction =
  | 'row-above'
  | 'row-below'
  | 'row-delete'
  | 'col-left'
  | 'col-right'
  | 'col-delete';

/** Transforms a normalized 2D markdown table matrix without breaking header/column alignment. */
export function transformTableMatrix(
  matrix: string[][],
  action: TableEditAction,
  rowIndex: number,
  colIndex: number
): string[][] | null {
  if (matrix.length === 0) return null;
  const colCount = Math.max(1, ...matrix.map((r) => r.length));
  const next = matrix.map((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push('');
    return padded;
  });

  if (action === 'row-above' || action === 'row-below') {
    const emptyRow = Array.from({ length: colCount }, () => '');
    const insertIdx =
      rowIndex <= 0 ? 1 : action === 'row-above' ? rowIndex : rowIndex + 1;
    next.splice(insertIdx, 0, emptyRow);
    return next;
  }

  if (action === 'row-delete') {
    if (next.length <= 2 || rowIndex <= 0) return null;
    next.splice(rowIndex, 1);
    return next;
  }

  if (action === 'col-left' || action === 'col-right') {
    const insertCol = action === 'col-left' ? colIndex : colIndex + 1;
    return next.map((r, rIdx) => {
      const copy = [...r];
      copy.splice(insertCol, 0, rIdx === 0 ? '列' : '');
      return copy;
    });
  }

  if (action === 'col-delete') {
    if (colCount <= 1) return null;
    return next.map((r) => r.filter((_, cIdx) => cIdx !== colIndex));
  }

  return next;
}
