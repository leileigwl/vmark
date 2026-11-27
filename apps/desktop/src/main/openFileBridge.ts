import { app, type BrowserWindow } from 'electron';
import { IPC_EVENT_CHANNELS } from '@vcat/shared';
import { extractOpenTargetFromArgv } from './workspaceFileOps';

export { extractOpenTargetFromArgv };

export interface OpenFileBridge {
  queueOrSend: (filePath: string, ensureWin: () => BrowserWindow | null) => void;
  consumePending: () => string | null;
  markRendererNotReady: () => void;
}

function focusWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

/**
 * Coordinates external file opening across cold launch, warm start, and macOS Dock-closed
 * window recreation: renderer pulls `consumePending()` on mount (no race with startup workspace
 * restore), and warm `open-file` events push immediately once renderer is ready.
 */
export function createOpenFileBridge(): OpenFileBridge {
  let pendingPath: string | null = null;
  let rendererReady = false;

  return {
    markRendererNotReady: () => {
      rendererReady = false;
    },
    consumePending: () => {
      rendererReady = true;
      const next = pendingPath;
      pendingPath = null;
      return next;
    },
    queueOrSend: (filePath: string, ensureWin: () => BrowserWindow | null) => {
      if (!filePath) return;
      const win = ensureWin();
      if (rendererReady && win && !win.isDestroyed() && !win.webContents.isLoading()) {
        win.webContents.send(IPC_EVENT_CHANNELS.onOpenExternalFile, filePath);
        focusWindow(win);
        return;
      }
      pendingPath = filePath;
      focusWindow(win);
    },
  };
}

/** Binds macOS `open-file` and initial process argv open-file events to `bridge`. */
export function registerOpenFileAppEvents(
  bridge: OpenFileBridge,
  ensureWin: () => BrowserWindow | null
): void {
  const initialTarget = extractOpenTargetFromArgv(process.argv, app.getAppPath());
  if (initialTarget) bridge.queueOrSend(initialTarget, () => (app.isReady() ? ensureWin() : null));

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    bridge.queueOrSend(filePath, () => (app.isReady() ? ensureWin() : null));
  });
}
