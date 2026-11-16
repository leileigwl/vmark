import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@vcat/core', '@vcat/image-pipeline', '@vcat/adapters', '@vcat/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@vcat/shared'] })],
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
