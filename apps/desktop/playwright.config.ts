import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const defaultMacChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localChromium = process.env.PW_CHROMIUM_PATH || (existsSync(defaultMacChrome) ? defaultMacChrome : undefined);

function allocateFreePort(): string {
  if (process.env.VMARK_PW_PORT) return process.env.VMARK_PW_PORT;
  const allocated = execFileSync(
    process.execPath,
    [
      '-e',
      "const net=require('node:net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});",
    ],
    { encoding: 'utf8' }
  ).trim();
  process.env.VMARK_PW_PORT = allocated;
  return allocated;
}

function allocateTmpDir(): string {
  if (process.env.VMARK_PW_TMP_DIR) return process.env.VMARK_PW_TMP_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-pw-'));
  process.env.VMARK_PW_TMP_DIR = dir;
  return dir;
}

const port = allocateFreePort();
const tmpDir = allocateTmpDir();
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  testIgnore: ['**/electron-smoke.spec.ts'],
  outputDir: path.join(tmpDir, 'test-results'),
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 860 },
    launchOptions: localChromium ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: `npx vite preview --outDir out/renderer --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
