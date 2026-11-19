import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { HarnessProjectConfig, ParsedDiffFile, RatchetConfig, HarnessState } from './types.ts';

/**
 * Normalize OS file paths to POSIX forward slashes relative to repo root.
 */
export function toPosixPath(inputPath: string, rootDir?: string): string {
  const rel = rootDir && path.isAbsolute(inputPath) ? path.relative(rootDir, inputPath) : inputPath;
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Compile a simplified glob pattern supporting **, *, and ? into a strict RegExp.
 */
function globToRegExp(pattern: string): RegExp {
  const normalized = toPosixPath(pattern);
  let out = '^';
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          out += '(?:.+/)?';
          i += 3;
          continue;
        }
        out += '.*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if ('\\^$.|+()[]{}'.includes(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += '$';
  return new RegExp(out);
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const normFile = toPosixPath(filePath);
  const normPat = toPosixPath(pattern);
  return globToRegExp(normPat).test(normFile);
}

export function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pat) => matchesGlob(filePath, pat));
}

/**
 * Extract deterministic literal prefix before first wildcard for conservative glob overlap checks.
 */
function globStaticBase(pattern: string): string {
  const norm = toPosixPath(pattern);
  const wildcardIdx = norm.search(/[*?]/);
  return wildcardIdx === -1 ? norm : norm.slice(0, wildcardIdx);
}

/**
 * Determine whether two path/glob patterns could match an overlapping file set.
 */
export function globsIntersect(patternsA: string[], patternsB: string[]): boolean {
  for (const a of patternsA) {
    for (const b of patternsB) {
      if (a === b || matchesGlob(a, b) || matchesGlob(b, a)) {
        return true;
      }
      const baseA = globStaticBase(a);
      const baseB = globStaticBase(b);
      if (baseA === '' || baseB === '') {
        return true;
      }
      const minLen = Math.min(baseA.length, baseB.length);
      if (baseA.slice(0, minLen) === baseB.slice(0, minLen)) {
        const trailingA = a.endsWith('**') || a.endsWith('/*');
        const trailingB = b.endsWith('**') || b.endsWith('/*');
        if (
          baseA === baseB ||
          (baseA.length < baseB.length && trailingA && matchesGlob(baseB.replace(/\/$/, ''), a)) ||
          (baseB.length < baseA.length && trailingB && matchesGlob(baseA.replace(/\/$/, ''), b))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function loadProjectConfig(rootDir: string): HarnessProjectConfig {
  return readJson<HarnessProjectConfig>(path.join(rootDir, '.harness/project.json'));
}

export function loadStateConfig(rootDir: string): HarnessState {
  return readJson<HarnessState>(path.join(rootDir, '.harness/state.json'));
}

export function loadRatchetConfig(rootDir: string): RatchetConfig {
  return readJson<RatchetConfig>(path.join(rootDir, '.harness/ratchet.json'));
}

export function countFileLines(filePath: string): number {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.length === 0) return 0;
  const lines = raw.split('\n');
  return raw.endsWith('\n') ? lines.length - 1 : lines.length;
}

export function runGit(args: string[], cwd: string): { ok: boolean; stdout: string } {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

/**
 * Parse `git diff -U0` unified diff output into per-file line additions and deletions.
 */
export function parseUnifiedDiff(diffText: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;
  let newLineNum = 0;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/.+ b\/(.+)$/);
      const file = m ? m[1] : '';
      current = {
        file,
        isNew: false,
        isDeleted: false,
        addedLines: [],
        removedLines: [],
        addedCount: 0,
        removedCount: 0,
      };
      if (file) files.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('new file mode ')) {
      current.isNew = true;
      continue;
    }
    if (line.startsWith('deleted file mode ')) {
      current.isDeleted = true;
      continue;
    }
    if (line.startsWith('+++ b/')) {
      current.file = line.slice(6);
      continue;
    }
    if (line.startsWith('+++ /dev/null')) {
      current.isDeleted = true;
      continue;
    }
    if (line.startsWith('--- ')) continue;

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLineNum = Number.parseInt(hunk[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines.push({ line: newLineNum, content: line.slice(1) });
      current.addedCount += 1;
      newLineNum += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.removedLines.push({ content: line.slice(1) });
      current.removedCount += 1;
    } else if (!line.startsWith('\\')) {
      newLineNum += 1;
    }
  }
  return files;
}

/**
 * Walk directory recursively collecting matching files while ignoring build/dependency dirs.
 */
export function walkSourceFiles(dir: string, rootDir: string, exts = ['.ts', '.tsx']): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const ignored = new Set(['node_modules', 'dist', 'out', 'release', '.git', '.turbo']);

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSourceFiles(full, rootDir, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(toPosixPath(full, rootDir));
    }
  }
  return results;
}

/** Recursively copy a template directory or file tree, marking shell scripts and git hooks executable. */
export function copyTree(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (src.endsWith('.sh') || src.includes('.githooks/')) {
    fs.chmodSync(dest, 0o755);
  }
}

/** Extract a CLI `--flag value` argument if present. */
export function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
