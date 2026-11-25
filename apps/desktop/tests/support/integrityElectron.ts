import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Real-Electron (L3) harness for the data-integrity smoke suite: a throwaway userData
 * dir + workspace holding `a.md`, launched with the built `out/main/index.js`.
 * The same dirs survive a relaunch, so tests can kill / crash the app and start it again.
 */
export interface IntegrityEnv {
  userData: string;
  workspace: string;
  file: string;
  cleanup: () => void;
}

export function makeEnv(content: string, rel = 'a.md'): IntegrityEnv {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-int-ud-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-int-ws-'));
  const file = path.join(workspace, rel);
  fs.writeFileSync(file, content, 'utf8');
  fs.writeFileSync(
    path.join(userData, 'vcat-config.json'),
    JSON.stringify({
      workspacePath: workspace,
      recentWorkspaces: [workspace],
      imageBed: { strategy: 'platform_private' },
      startup: { mode: 'last_opened', lastArticlePath: rel },
    }),
    'utf8'
  );
  return {
    userData,
    workspace,
    file,
    cleanup: () => {
      fs.rmSync(userData, { recursive: true, force: true });
      fs.rmSync(workspace, { recursive: true, force: true });
    },
  };
}

/** Every app launched here and not yet released, with its userData dir and main process. */
const launched = new Map<ElectronApplication, { userData: string; proc: ChildProcess }>();

export async function launch(env: IntegrityEnv): Promise<{ app: ElectronApplication; win: Page }> {
  const cleanEnv: Record<string, string> = { VMARK_USER_DATA_DIR: env.userData };
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') cleanEnv[k] = v;
  cleanEnv.VMARK_USER_DATA_DIR = env.userData;
  const app = await electron.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      path.resolve(__dirname, '../../out/main/index.js'),
    ],
    env: cleanEnv,
  });
  launched.set(app, { userData: env.userData, proc: app.process() });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 20_000 });
  await win.waitForTimeout(300);
  return { app, win };
}

/** Caret at the end of the last text block of the editor. */
export async function caretAtEnd(win: Page): Promise<void> {
  await win.evaluate(() => {
    const reset = document.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
    reset.focus();
    const blocks = reset.querySelectorAll(':scope > :not([data-vcat-temp-gap])');
    const last = (blocks[blocks.length - 1] as HTMLElement | undefined) ?? reset;
    const r = document.createRange();
    r.selectNodeContents(last);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  });
}

/** Waits until the Electron process has exited (or `ms` passes). */
export async function waitForExit(app: ElectronApplication, ms = 10_000): Promise<boolean> {
  const proc = app.process();
  if (proc.exitCode !== null || proc.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** SIGKILLs the main process (and with it the renderer) — a force quit / power cut. */
export async function hardKill(app: ElectronApplication): Promise<void> {
  await killGroup(app);
  await releaseApp(app);
}

async function killGroup(app: ElectronApplication): Promise<void> {
  const proc = app.process();
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
  } catch {
    // Not a process-group leader; fall through to the direct kill.
  }
  proc.kill('SIGKILL');
  await waitForExit(app, 5000);
}

/**
 * Makes sure Node sees the app's stdio close after its main process is gone. Playwright waits for the
 * child's 'close' event (not just 'exit') when the worker shuts down; a process that setsid()s out of
 * the group and inherited stdout/stderr (e.g. a crashpad handler) keeps the pipes open forever and the
 * worker dies with "Worker teardown timeout". Kill such strays (found by our unique userData dir in their
 * command line), and as a last resort drop our end of the pipes.
 */
export async function releaseApp(app: ElectronApplication): Promise<void> {
  const entry = launched.get(app);
  if (!entry) return;
  launched.delete(app);
  const { userData, proc } = entry;
  if (proc.exitCode === null && proc.signalCode === null) await killGroup(app);
  if (await stdioClosed(proc, 3000)) return;
  const strays = killProcessesMentioning(userData);
  if (await stdioClosed(proc, 2000)) return;
  console.warn(`[integrityElectron] pid ${proc.pid} stdio still open after exit (killed strays: ${strays.join(', ') || 'none'}); closing our end`);
  for (const stream of proc.stdio) stream?.destroy();
}

/** Releases every app a test launched and did not release itself; use in test.afterEach. */
export async function releaseLaunchedApps(): Promise<void> {
  for (const app of [...launched.keys()]) await releaseApp(app);
}

async function stdioClosed(proc: ChildProcess, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    // Node emits 'close' once every stdio stream after stdin has closed.
    if (proc.stdio.slice(1).every((stream) => !stream || stream.closed)) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** SIGKILLs every other process whose command line contains `needle` (Linux /proc and macOS `ps`). Returns their pids. */
function killProcessesMentioning(needle: string): number[] {
  const killed: number[] = [];
  if (process.platform === 'linux') {
    for (const entry of fs.readdirSync('/proc')) {
      const pid = Number(entry);
      if (!Number.isInteger(pid) || pid === process.pid) continue;
      let cmdline: string;
      try {
        cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      } catch (error) {
        if (isGoneOrForeign(error)) continue; // exited while we scanned, or not ours to read
        throw error;
      }
      if (!cmdline.includes(needle)) continue;
      try {
        process.kill(pid, 'SIGKILL');
        killed.push(pid);
      } catch (error) {
        if (!isGoneOrForeign(error)) throw error;
      }
    }
    return killed;
  }

  if (process.platform === 'darwin') {
    const out = execFileSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const cmdline = match[2] ?? '';
      if (!Number.isInteger(pid) || pid === process.pid || !cmdline.includes(needle)) continue;
      try {
        process.kill(pid, 'SIGKILL');
        killed.push(pid);
      } catch (error) {
        if (!isGoneOrForeign(error)) throw error;
      }
    }
  }
  return killed;
}

function isGoneOrForeign(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ESRCH' || code === 'EACCES';
}

/** Text of the editor after relaunch, without Vditor's zero-width helpers. */
export async function editorText(win: Page): Promise<string> {
  return win.evaluate(() =>
    ((document.querySelector('.vditor-ir .vditor-reset') as HTMLElement).innerText || '').replace(/\u200b/g, '')
  );
}

/** Optional screenshot into VMARK_SHOT_DIR; never fails a test. */
export async function shotWin(win: Page, name: string): Promise<void> {
  const dir = process.env.VMARK_SHOT_DIR;
  if (!dir) return;
  await win.screenshot({ path: `${dir}/${name}.png` }).catch(() => undefined);
}
