import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildArticleMeta } from '@vcat/core';
import type { ArticleMeta, ImportExternalFilesResult, OpenExternalFileResult } from '@vcat/shared';

const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;

let internalCopiedPaths: string[] = [];

export function isMarkdownFile(filePath: string): boolean {
  return MARKDOWN_EXT_RE.test(filePath.trim());
}

function toPosixRel(rootDir: string, targetAbs: string): string {
  return path.relative(rootDir, targetAbs).split(path.sep).join('/');
}

function isInsideDir(parentDir: string, childAbs: string): boolean {
  const parentResolved = path.resolve(parentDir);
  const childResolved = path.resolve(childAbs);
  return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
}

/**
 * Resolves an external file or folder path for opening:
 * - Folder: switches workspace to that folder (`relativePath: null`).
 * - Markdown file inside current workspace: keeps current workspace and returns relativePath.
 * - Markdown file outside current workspace: switches workspace to its parent folder.
 */
export async function resolveExternalOpenTarget(
  currentWorkspacePath: string | null,
  rawTargetPath: string
): Promise<OpenExternalFileResult> {
  const targetAbs = path.resolve(rawTargetPath);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(targetAbs);
  } catch {
    throw new Error(`文件或文件夹不存在：${rawTargetPath}`);
  }

  if (stat.isDirectory()) {
    return { workspacePath: targetAbs, relativePath: null };
  }
  if (!stat.isFile() || !isMarkdownFile(targetAbs)) {
    throw new Error('暂仅支持打开 Markdown (.md / .markdown) 文件或文件夹');
  }

  if (currentWorkspacePath) {
    const wsResolved = path.resolve(currentWorkspacePath);
    if (isInsideDir(wsResolved, targetAbs)) {
      return { workspacePath: wsResolved, relativePath: toPosixRel(wsResolved, targetAbs) };
    }
  }

  const parentDir = path.dirname(targetAbs);
  return { workspacePath: parentDir, relativePath: path.basename(targetAbs) };
}

/** Generates a non-colliding file or folder name inside `destDir`. */
export function pickNonCollidingDest(destDir: string, baseName: string, isDir: boolean): string {
  const firstCandidate = path.join(destDir, baseName);
  if (!existsSync(firstCandidate)) return firstCandidate;

  const ext = isDir ? '' : path.extname(baseName);
  const stem = isDir ? baseName : baseName.slice(0, baseName.length - ext.length);
  let index = 2;
  while (true) {
    const candidate = path.join(destDir, `${stem} ${index}${ext}`);
    if (!existsSync(candidate)) return candidate;
    index++;
  }
}

async function collectCopiedArticles(workspaceRoot: string, dirAbs: string, out: ArticleMeta[]): Promise<void> {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'assets' || entry.name === 'node_modules') continue;
    const full = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      await collectCopiedArticles(workspaceRoot, full, out);
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      const [content, stat] = await Promise.all([fs.readFile(full, 'utf-8'), fs.stat(full)]);
      out.push(buildArticleMeta(content, toPosixRel(workspaceRoot, full), full, stat.mtimeMs));
    }
  }
}

/**
 * Copies external files or directories into `targetFolder` inside `workspacePath`.
 * Name collisions are resolved automatically (`name 2.md`) so existing files are never overwritten.
 */
export async function copyExternalItemsIntoWorkspace(
  workspacePath: string,
  sourcePaths: string[],
  targetFolder = ''
): Promise<ImportExternalFilesResult> {
  const cleanFolder = targetFolder.trim().replace(/^[\\/]+|[\\/]+$/g, '');
  const rootAbs = path.resolve(workspacePath);
  const destDir = cleanFolder ? path.resolve(rootAbs, cleanFolder) : rootAbs;
  if (destDir !== rootAbs && !destDir.startsWith(`${rootAbs}${path.sep}`)) {
    throw new Error('Forbidden path traversal outside workspace');
  }
  await fs.mkdir(destDir, { recursive: true });

  const importedArticles: ArticleMeta[] = [];
  const importedFolders: string[] = [];
  const skipped: string[] = [];

  for (const rawSrc of sourcePaths) {
    if (!rawSrc?.trim()) continue;
    const srcAbs = path.resolve(rawSrc);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(srcAbs);
    } catch {
      skipped.push(rawSrc);
      continue;
    }

    const baseName = path.basename(srcAbs);
    if (stat.isDirectory()) {
      if (isInsideDir(srcAbs, destDir)) {
        skipped.push(baseName);
        continue;
      }
      const destAbs = pickNonCollidingDest(destDir, baseName, true);
      await fs.cp(srcAbs, destAbs, { recursive: true });
      importedFolders.push(toPosixRel(workspacePath, destAbs));
      await collectCopiedArticles(workspacePath, destAbs, importedArticles);
    } else if (stat.isFile()) {
      const destAbs = pickNonCollidingDest(destDir, baseName, false);
      await fs.copyFile(srcAbs, destAbs);
      if (isMarkdownFile(destAbs)) {
        const [content, destStat] = await Promise.all([fs.readFile(destAbs, 'utf-8'), fs.stat(destAbs)]);
        importedArticles.push(
          buildArticleMeta(content, toPosixRel(workspacePath, destAbs), destAbs, destStat.mtimeMs)
        );
      }
    } else {
      skipped.push(baseName);
    }
  }

  return { importedArticles, importedFolders, skipped };
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Parses macOS `NSFilenamesPboardType` XML plist strings into file paths. */
export function parseMacPlistFilePaths(xml: string): string[] {
  const results: string[] = [];
  const matches = xml.matchAll(/<string>([\s\S]*?)<\/string>/gi);
  for (const m of matches) {
    const decoded = decodeXmlEntities(m[1]).trim();
    if (decoded.startsWith('/')) results.push(decoded);
  }
  return results;
}

/** Parses `text/uri-list` or `public.file-url` newline-separated `file://` URLs. */
export function parseFileUriList(text: string): string[] {
  const results: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('file://')) {
      try {
        results.push(fileURLToPath(line));
      } catch {
        // ignore invalid URI
      }
    }
  }
  return results;
}

/** Parses Windows `FileNameW` UTF-16LE null-terminated clipboard buffer. */
export function parseWindowsFileNameW(buf: Buffer): string[] {
  if (buf.length === 0) return [];
  return buf
    .toString('utf16le')
    .split('\0')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ClipboardLike {
  availableFormats?: () => string[];
  read: (format: string) => string;
  readBuffer: (format: string) => Buffer;
  writeBuffer: (format: string, buffer: Buffer) => void;
}

function readMacPlistBuffer(buf: Buffer): string[] {
  if (buf.length === 0) return [];
  const head = buf.subarray(0, 6).toString('ascii');
  if (head === 'bplist') {
    try {
      const xml = execFileSync('plutil', ['-convert', 'xml1', '-o', '-', '-'], {
        input: buf,
        encoding: 'utf8',
      });
      return parseMacPlistFilePaths(xml);
    } catch {
      return [];
    }
  }
  return parseMacPlistFilePaths(buf.toString('utf8'));
}

/** Reads file paths currently on the OS clipboard (Finder / Explorer / Linux), falling back to internal clipboard. */
export function readOsClipboardFilePaths(cb: ClipboardLike): string[] {
  const plistRaw = cb.read('NSFilenamesPboardType');
  if (plistRaw) {
    const parsed = parseMacPlistFilePaths(plistRaw);
    if (parsed.length > 0) return parsed;
  }
  const plistBuf = cb.readBuffer('NSFilenamesPboardType');
  if (plistBuf.length > 0) {
    const parsed = readMacPlistBuffer(plistBuf);
    if (parsed.length > 0) return parsed;
  }
  const fileUrl = cb.read('public.file-url');
  if (fileUrl) {
    const parsed = parseFileUriList(fileUrl);
    if (parsed.length > 0) return parsed;
  }
  const uriList = cb.read('text/uri-list') || cb.read('x-special/gnome-copied-files');
  if (uriList) {
    const parsed = parseFileUriList(uriList);
    if (parsed.length > 0) return parsed;
  }
  const winBuf = cb.readBuffer('FileNameW');
  if (winBuf.length > 0) {
    const parsed = parseWindowsFileNameW(winBuf);
    if (parsed.length > 0) return parsed;
  }
  return [...internalCopiedPaths];
}

/** Writes workspace file paths to both internal clipboard and OS pasteboard for cross-app pasting. */
export function writeOsClipboardFilePaths(cb: ClipboardLike, absPaths: string[]): void {
  internalCopiedPaths = [...absPaths];
  if (absPaths.length === 0) return;

  if (process.platform === 'darwin') {
    const items = absPaths.map((p) => `  <string>${encodeXmlEntities(p)}</string>`).join('\n');
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<array>\n${items}\n</array>\n</plist>`;
    cb.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf8'));
    return;
  }
  if (process.platform === 'win32') {
    cb.writeBuffer('FileNameW', Buffer.from(`${absPaths[0]}\0`, 'utf16le'));
    return;
  }
  const uriList = absPaths.map((p) => pathToFileURL(p).toString()).join('\n');
  cb.writeBuffer('text/uri-list', Buffer.from(uriList, 'utf8'));
}
