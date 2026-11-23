import { app, type BrowserWindow } from 'electron';
import { restoreEditorBackupsOnce, startEditorBackups } from './editorRecovery';

const FLUSH_TIMEOUT_MS = 3000;
let quitRequested = false;
let quitHookInstalled = false;

/**
 * Hot-exit style close guard (cf. VS Code / Sublime): before a window closes — close button,
 * ⌘W, ⌘Q / app.quit — ask its renderer to write the editor's unsaved text to disk and wait for
 * that write (at most 3s, so a hung renderer can never block quitting). A crashed renderer has
 * nothing to flush and closes at once.
 * It also puts back crash backups left by the last run (before the window loads any file) and
 * starts taking new ones for this window (main/editorRecovery.ts).
 */
export function protectEditorWindow(win: BrowserWindow): void {
  restoreEditorBackupsOnce();
  startEditorBackups(win);
  if (!quitHookInstalled) {
    quitHookInstalled = true;
    app.on('before-quit', () => {
      quitRequested = true;
    });
  }
  let flushed = false;
  win.on('close', (event) => {
    if (flushed || win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    event.preventDefault();
    const flush = win.webContents
      .executeJavaScript('window.__vmarkFlushBeforeClose ? window.__vmarkFlushBeforeClose() : null', true)
      .catch((err: unknown) => console.warn('[editor-safety] 关闭前落盘失败', err));
    const timeout = new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS));
    void Promise.race([flush, timeout]).then(() => {
      flushed = true;
      if (!win.isDestroyed()) win.close();
      // Preventing the close above also cancelled a pending quit; resume it.
      if (quitRequested) app.quit();
    });
  });
}
