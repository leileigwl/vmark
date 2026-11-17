import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 860 },
    // Use Playwright's own bundled Chromium by default (CI runs `playwright install chromium`).
    // Set PW_CHROMIUM_PATH locally only if you need a specific browser binary.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npx vite preview --outDir out/renderer --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
