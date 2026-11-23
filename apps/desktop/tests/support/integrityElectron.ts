import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
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
  const proc = app.process();
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
  } catch {
    // Not a process-group leader; fall through to the direct kill.
  }
  proc.kill('SIGKILL');
  await waitForExit(app, 5000);
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
