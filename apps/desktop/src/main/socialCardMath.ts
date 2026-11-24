import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import katex from 'katex';
import { createKatexCardMath, rebaseKatexFonts, type CardMathRenderer } from '@vcat/core';

let cached: Promise<CardMathRenderer> | null = null;

/**
 * KaTeX for rasterized cards: the stylesheet is inlined and its fonts point at the
 * bundled `katex/dist/fonts` via file:// (the offscreen window loads cards as data: URLs).
 */
export function getCardMathRenderer(): Promise<CardMathRenderer> {
  cached ??= (async () => {
    const cssPath = createRequire(import.meta.url).resolve('katex/dist/katex.min.css');
    const css = await fs.readFile(cssPath, 'utf8');
    const fontBase = pathToFileURL(path.join(path.dirname(cssPath), 'fonts')).href;
    return createKatexCardMath(katex, rebaseKatexFonts(css, fontBase));
  })();
  return cached;
}
