import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/electron-smoke.spec.ts', '**/smoke-integrity-electron-*.spec.ts'],
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    screenshot: 'only-on-failure',
  },
});
