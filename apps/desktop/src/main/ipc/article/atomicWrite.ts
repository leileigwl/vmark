import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/**
 * Saves `content` to `target` so the old file is never left truncated or half-written
 * (Sublime `atomic_save`, Vim `writebackup`): write a temp file next to it, flush it to disk,
 * then rename it over the target. If any step fails (disk full, no permission) the original
 * stays byte-for-byte as it was and the error reaches the caller.
 * - A read-only target stays protected: rename would bypass the file's own permission bits.
 * - Symlinks are followed, so the link keeps pointing at the (updated) real file.
 * - The file mode is carried over to the new file.
 */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
  let real = target;
  let mode: number | undefined;
  try {
    real = await fs.realpath(target);
    mode = (await fs.stat(real)).mode & 0o7777;
    await fs.access(real, fsConstants.W_OK);
  } catch (err) {
    if (errCode(err) !== 'ENOENT') throw err;
  }
  const tmp = path.join(path.dirname(real), `.${path.basename(real)}.${randomBytes(6).toString('hex')}.vmark-tmp`);
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf-8', flush: true });
    if (mode !== undefined) await fs.chmod(tmp, mode);
    await fs.rename(tmp, real);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}
