import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@vcat/core', '@vcat/image-pipeline', '@vcat/adapters', '@vcat/shared'] })],
    build: {
      rollupOptions: {
        external: ['playwright-core'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@vcat/shared'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          stealthLogin: resolve('src/preload/stealthLogin.ts'),
        },
      },
    },
  },
  renderer: {
    publicDir: resolve('src/renderer/public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
