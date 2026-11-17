// Copies vditor's runtime assets (lute, katex, mermaid, icons...) into the renderer's
// public dir. That dir is gitignored, so a fresh clone (e.g. CI) must regenerate it
// before dev/build, otherwise index.css fails to resolve katex.min.css.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const src = join(dirname(require.resolve('vditor/package.json')), 'dist');
const dest = join(here, '..', 'src', 'renderer', 'public', 'vditor', 'dist');

if (!existsSync(src)) {
  console.error(`[copy-vditor-assets] vditor dist not found at ${src}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-vditor-assets] copied ${src} -> ${dest}`);
