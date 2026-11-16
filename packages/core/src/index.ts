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
