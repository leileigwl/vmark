/**
 * Renders the sample article to PNG cards with Playwright Chromium, using the same
 * measure → paginate → render pipeline as the Electron rasterizer.
 *
 *   node --experimental-strip-types scripts/render-social-cards.ts [outDir] [themeId...]
 *   SAMPLE_MD=/path/article.md … renders another article (relative images resolve next to it).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PLATFORM_COVER_SPECS, SOCIAL_CARD_PRESETS } from '@vcat/core';
import { renderCardDeck, type CardPageDriver } from '../src/main/socialCardRasterizer.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const outDir = process.argv[2] || '/tmp/shots';
const themes = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(SOCIAL_CARD_PRESETS);
const samplePath = process.env.SAMPLE_MD ? path.resolve(process.env.SAMPLE_MD) : path.join(here, 'fixtures/social-card-sample.md');
const markdown = await fs.readFile(samplePath, 'utf8');
const imageBaseDir = process.env.SAMPLE_MD ? path.dirname(samplePath) : repoRoot;
const spec = PLATFORM_COVER_SPECS['3:4'];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height } });
  const tmpHtml = path.join(outDir, '.card.html');
  const driver: CardPageDriver = {
    // A file:// page (not setContent) so local file:// images are allowed to load.
    load: async (html) => {
      await fs.writeFile(tmpHtml, html);
      await page.goto(`file://${tmpHtml}`);
    },
    evaluate: (script) => page.evaluate(script),
    capture: () => page.screenshot({ clip: { x: 0, y: 0, width: spec.width, height: spec.height } }),
  };
  for (const themeId of themes) {
    const { payload, images, overflow } = await renderCardDeck(driver, {
      markdown,
      themeId,
      maxCards: 18,
      imageBaseDir,
      footerBrand: '@Vmark',
    });
    for (let i = 0; i < images.length; i++) {
      await fs.writeFile(path.join(outDir, `cards-${themeId}-${String(i + 1).padStart(2, '0')}.png`), images[i]);
    }
    const fills = payload.cards.map((c) => (c.type === 'cover' ? 'cover' : `${Math.round((c.fill ?? 0) * 100)}%`));
    console.log(`${themeId}: ${images.length} cards | fill ${fills.join(' ')} | overflow ${overflow.map((o) => o.toFixed(2)).join(" ")}`);
  }
  await fs.rm(tmpHtml, { force: true });
} finally {
  await browser.close();
}
