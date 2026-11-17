import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 860 },
    launchOptions: {
      executablePath:
        '/Users/leileigwl/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    },
  },
  webServer: {
    command: 'npx vite preview --outDir out/renderer --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
