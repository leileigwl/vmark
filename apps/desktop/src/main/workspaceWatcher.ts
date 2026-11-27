import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', '.obsidian', 'dist', 'out']);

export function shouldIgnoreFilename(filename: string | null): boolean {
  if (!filename) return false;
  const normalized = filename.split(path.sep).join('/');
  const parts = normalized.split('/');
  for (const part of parts) {
    if (!part) continue;
    if (part === '.DS_Store' || IGNORED_SEGMENTS.has(part) || part.startsWith('.vmark-')) {
      return true;
    }
  }
  if (normalized.endsWith('.tmp') || normalized.endsWith('~')) return true;
  return false;
}

export interface WorkspaceWatcher {
  watch: (dir: string | null) => void;
  close: () => void;
}

/**
 * Watches the active workspace directory for external filesystem changes (Finder/Explorer drops,
 * renames, deletions) and notifies the renderer after debouncing rapid FS bursts.
 */
export function createWorkspaceWatcher(onChange: () => void, debounceMs = 250): WorkspaceWatcher {
  let watcher: FSWatcher | null = null;
  let watchedDir: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const close = () => {
    clearTimer();
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // ignore close errors
      }
      watcher = null;
    }
    watchedDir = null;
  };

  const scheduleNotify = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  const startWatch = (dir: string | null) => {
    const resolved = dir ? path.resolve(dir) : null;
    if (resolved === watchedDir && watcher) return;
    close();
    if (!resolved || !existsSync(resolved)) return;

    const handleEvent = (_eventType: string, filename: string | Buffer | null) => {
      const name = typeof filename === 'string' ? filename : filename ? filename.toString('utf8') : null;
      if (shouldIgnoreFilename(name)) return;
      scheduleNotify();
    };

    try {
      watcher = watch(resolved, { recursive: true }, handleEvent);
      watchedDir = resolved;
    } catch {
      try {
        watcher = watch(resolved, { recursive: false }, handleEvent);
        watchedDir = resolved;
      } catch {
        watcher = null;
        watchedDir = null;
      }
    }

    watcher?.on('error', () => {
      // Directory may have been removed or unmounted externally; close cleanly.
      close();
    });
  };

  return { watch: startWatch, close };
}
