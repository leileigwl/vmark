import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** One crash backup: the unsaved editor text of `path`, and what the file held when it was taken. */
export interface Backup {
  path: string;
  base: string;
  content: string;
  savedAt: number;
}

export type RestoreOutcome = 'restored' | 'copied' | 'already-saved' | 'kept';

function writeFileAtomicSync(target: string, content: string): void {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(6).toString('hex')}.vmark-tmp`);
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf-8', flush: true });
    fs.renameSync(tmp, target);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** `a.md` → `a.recovered-20261124-021530.md` (local time of the backup). */
export function recoveredName(absPath: string, savedAt: number): string {
  const d = new Date(savedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return absPath.replace(/(\.md)?$/i, `.recovered-${stamp}.md`);
}

/** Puts one backup back. Never overwrites a file that changed since the backup was taken. */
export function restoreBackup(b: Backup): RestoreOutcome {
  const disk = fs.existsSync(b.path) ? fs.readFileSync(b.path, 'utf-8') : null;
  if (disk === b.content) return 'already-saved';
  if (disk === b.base) {
    writeFileAtomicSync(b.path, b.content);
    console.warn('[editor-recovery] 已从崩溃备份恢复未保存的修改：', b.path);
    return 'restored';
  }
  if (!fs.existsSync(path.dirname(b.path))) return 'kept'; // folder gone (unmounted drive?): wait for it
  const copy = recoveredName(b.path, b.savedAt);
  writeFileAtomicSync(copy, b.content);
  console.warn('[editor-recovery] 原文件已被改动，崩溃备份另存为副本：', copy);
  return 'copied';
}

/** Restores every `*.json` backup in `dir`; a backup is deleted only once its text is safe on disk. */
export function restoreBackups(dir: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== 'ENOENT') console.warn('[editor-recovery] 读取备份目录失败', err);
    return;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const outcome = restoreBackup(JSON.parse(fs.readFileSync(file, 'utf-8')) as Backup);
      if (outcome !== 'kept') fs.rmSync(file, { force: true });
    } catch (err) {
      console.warn('[editor-recovery] 处理备份失败，保留备份文件', file, err);
    }
  }
}
