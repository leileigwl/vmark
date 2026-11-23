import { app, type BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readAppConfig, resolveSafePath } from './ipc/context';
import { writeFileAtomic } from './ipc/article/index';
import { type Backup, restoreBackups } from './editorRecoveryRestore';

/**
 * Crash recovery backups (cf. Vim swap files, VS Code hot-exit backups). While an article has
 * unsaved edits, the main process pulls a snapshot from the renderer every 500ms and keeps it in
 * `<userData>/editor-recovery/<sha1(path)>.json`. A crash, SIGKILL or a frozen renderer therefore
 * loses at most the last half second of typing. On the next launch, before any window loads,
 * each backup is put back:
 *   - file on disk unchanged since the backup was taken → the backup is written into the file;
 *   - file changed by something else meanwhile → the backup goes next to it as
 *     `<name>.recovered-<time>.md`, nothing is overwritten;
 *   - file already holds the backup → the backup is dropped.
 */
type Snapshot = { rel: string; base: string; content: string } | { rel: string; clean: true } | null;

const POLL_MS = 500;
let restored = false;

function recoveryDir(): string {
  return path.join(app.getPath('userData'), 'editor-recovery');
}

function backupFile(absPath: string): string {
  return path.join(recoveryDir(), `${createHash('sha1').update(absPath).digest('hex')}.json`);
}

/** Puts every crash backup back. Synchronous on purpose: it must finish before the editor reads files. */
export function restoreEditorBackupsOnce(): void {
  if (restored) return;
  restored = true;
  restoreBackups(recoveryDir());
}

/** A backup whose file still holds the old base was never saved (e.g. the flush failed): keep it. */
async function stillUnsaved(file: string): Promise<boolean> {
  try {
    const b = JSON.parse(await fs.promises.readFile(file, 'utf-8')) as Backup;
    return b.content !== b.base && (await fs.promises.readFile(b.path, 'utf-8')) === b.base;
  } catch (err) {
    return (err as NodeJS.ErrnoException | null)?.code !== 'ENOENT';
  }
}

async function persist(snap: NonNullable<Snapshot>): Promise<void> {
  const cfg = await readAppConfig();
  if (!cfg.workspacePath) return;
  const abs = resolveSafePath(cfg.workspacePath, snap.rel);
  const file = backupFile(abs);
  if ('clean' in snap && (await stillUnsaved(file))) return;
  if ('clean' in snap || snap.content === snap.base) {
    await fs.promises.rm(file, { force: true });
    return;
  }
  await fs.promises.mkdir(recoveryDir(), { recursive: true });
  const backup: Backup = { path: abs, base: snap.base, content: snap.content, savedAt: Date.now() };
  await writeFileAtomic(file, JSON.stringify(backup));
}

/** Pulls unsaved-edit snapshots from the window's renderer while it lives. */
export function startEditorBackups(win: BrowserWindow): void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy || win.isDestroyed() || win.webContents.isCrashed()) return;
    busy = true;
    win.webContents
      .executeJavaScript('window.__vmarkRecoverySnapshot ? window.__vmarkRecoverySnapshot() : null', true)
      .then((snap: Snapshot) => (snap ? persist(snap) : undefined))
      .catch((err: unknown) => console.warn('[editor-recovery] 备份失败', err))
      .finally(() => {
        busy = false;
      });
  }, POLL_MS);
  win.on('closed', () => clearInterval(timer));
}
