import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const defaultMacChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localChromium = process.env.PW_CHROMIUM_PATH || (existsSync(defaultMacChrome) ? defaultMacChrome : undefined);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 860 },
    launchOptions: localChromium ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: 'npx vite preview --outDir out/renderer --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
