import { app, type BrowserWindow } from 'electron';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { IPC_EVENT_CHANNELS } from '@vcat/shared';
import { isMarkdownFile } from './workspaceFileOps';

/** Extracts a single openable markdown file or folder path from CLI/second-instance argv. */
export function extractOpenTargetFromArgv(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    // Skip electron/app binary or script entry paths passed during dev startup.
    if (arg.endsWith('.js') || arg.endsWith('.mjs') || arg.endsWith('.cjs') || arg.endsWith('.app')) continue;
    const resolved = path.resolve(arg);
    if (!existsSync(resolved)) continue;
    try {
      const st = statSync(resolved);
      if (st.isDirectory() || (st.isFile() && isMarkdownFile(resolved))) {
        return resolved;
      }
    } catch {
      // ignore unreadable path
    }
  }
  return null;
}

export interface OpenFileBridge {
  queueOrSend: (filePath: string, getWin: () => BrowserWindow | null) => void;
  flush: (win: BrowserWindow | null) => void;
}

/** Buffers external open-file requests until the renderer finishes loading, then dispatches over IPC. */
export function createOpenFileBridge(): OpenFileBridge {
  let pendingPath: string | null = null;

  const sendToWindow = (win: BrowserWindow | null, filePath: string): boolean => {
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return false;
    win.webContents.send(IPC_EVENT_CHANNELS.onOpenExternalFile, filePath);
    return true;
  };

  return {
    queueOrSend: (filePath: string, getWin: () => BrowserWindow | null) => {
      if (!filePath) return;
      const win = getWin();
      if (!sendToWindow(win, filePath)) {
        pendingPath = filePath;
      }
    },
    flush: (win: BrowserWindow | null) => {
      if (!pendingPath) return;
      if (sendToWindow(win, pendingPath)) {
        pendingPath = null;
      }
    },
  };
}

/** Binds macOS `open-file` and initial process argv open-file events to `bridge`. */
export function registerOpenFileAppEvents(
  bridge: OpenFileBridge,
  getWin: () => BrowserWindow | null
): void {
  const initialTarget = extractOpenTargetFromArgv(process.argv);
  if (initialTarget) bridge.queueOrSend(initialTarget, getWin);

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    bridge.queueOrSend(filePath, getWin);
    const win = getWin();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
}
