import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type Electron from 'electron';
import {
  CARD_TYPE_SCALE,
  PLATFORM_COVER_SPECS,
  estimateCardBlockHeight,
  getCardContentBox,
  getSocialCardTheme,
  renderCardMeasureHtml,
  renderSocialCardHtml,
  renderXiaohongshuCards,
  type CardBlock,
  type PlatformCoverRatio,
  type XhsNotePayload,
} from '@vcat/core';

export interface GenerateSocialCardsParams {
  markdown: string;
  title?: string;
  themeId?: string;
  aspectRatio?: PlatformCoverRatio;
  brandName?: string;
  /** Optional signature in each card footer. */
  footerBrand?: string;
  maxCards?: number;
  /** Directory that relative image paths in the markdown resolve against. */
  imageBaseDir?: string;
  browserWindowFactory?: (opts: Electron.BrowserWindowConstructorOptions) => Electron.BrowserWindow;
}

export interface GeneratedCardsResult {
  imagePaths: string[];
  captionText: string;
  tags: string[];
}

/** The few page operations the card pipeline needs (Electron BrowserWindow or Playwright page). */
export interface CardPageDriver {
  load(html: string): Promise<void>;
  evaluate(script: string): Promise<unknown>;
  capture(): Promise<Buffer>;
}

/** Waits for web fonts and every <img> (with a timeout) so capture never races layout. */
const WAIT_READY = `(async () => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((img) => img.complete ? null : new Promise((r) => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
    setTimeout(r, 5000);
  })));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
})()`;

const MEASURE = `(async () => {
  await ${WAIT_READY};
  return Array.from(document.querySelectorAll('[data-b]')).map((el) => {
    const img = el.querySelector('img');
    if (img && !img.naturalWidth) return 0;
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  });
})()`;

/** Hides broken images and, as a last resort, shrinks content that would overflow the card. */
const FINALIZE = `(async () => {
  await ${WAIT_READY};
  document.querySelectorAll('img').forEach((img) => { if (!img.naturalWidth) img.closest('figure')?.remove(); });
  const box = document.querySelector('.box');
  const inner = box && box.firstElementChild;
  if (!box || !inner) return 1;
  const over = inner.scrollHeight / box.clientHeight;
  if (over > 1.002) inner.style.zoom = String(1 / over);
  return over;
})()`;

function resolveImages(markdown: string, baseDir?: string): string {
  if (!baseDir) return markdown;
  return markdown.replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (m, head: string, src: string) =>
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src) ? m : `${head}${pathToFileURL(path.resolve(baseDir, decodeURI(src))).href}`
  );
}

/**
 * Builds the deck with real rendered block heights: blocks are laid out in the page driver,
 * measured, and paginated; blocks created by splitting are measured on the next pass.
 */
export async function renderCardDeck(
  driver: CardPageDriver,
  params: Omit<GenerateSocialCardsParams, 'browserWindowFactory'>
): Promise<{ payload: XhsNotePayload; images: Buffer[]; overflow: number[] }> {
  const { title = '个人随笔', themeId = 'ios-memo', aspectRatio = '3:4', maxCards = 9 } = params;
  const markdown = resolveImages(params.markdown, params.imageBaseDir);
  const theme = getSocialCardTheme(themeId);
  const box = getCardContentBox(themeId, aspectRatio);
  const heights = new Map<string, number>();
  const build = (pending: CardBlock[]) =>
    renderXiaohongshuCards(markdown, {
      fallbackTitle: title,
      coverRatio: aspectRatio,
      themeId,
      measure: (b) => {
        const key = JSON.stringify(b);
        const known = heights.get(key);
        if (known !== undefined) return known;
        pending.push(b);
        return estimateCardBlockHeight(b, box.width);
      },
    });

  let payload: XhsNotePayload;
  for (let pass = 0; ; pass++) {
    const pending: CardBlock[] = [];
    payload = build(pending);
    const unique = [...new Map(pending.map((b) => [JSON.stringify(b), b])).values()];
    if (unique.length === 0 || pass >= 6) break;
    await driver.load(renderCardMeasureHtml(unique, theme, box.width, box.height * CARD_TYPE_SCALE.imageMaxRatio));
    const measured = await driver.evaluate(MEASURE);
    if (!Array.isArray(measured) || measured.length !== unique.length) break;
    unique.forEach((b, i) => heights.set(JSON.stringify(b), Number(measured[i]) || 0));
  }

  const cards = payload.cards.slice(0, Math.max(0, maxCards));
  const images: Buffer[] = [];
  const overflow: number[] = [];
  for (let i = 0; i < cards.length; i++) {
    await driver.load(
      renderSocialCardHtml(cards[i], {
        themeId,
        aspectRatio,
        cardIndex: i,
        totalCards: cards.length,
        brandName: params.brandName,
        footerBrand: params.footerBrand,
      })
    );
    overflow.push(Number(await driver.evaluate(FINALIZE)) || 1);
    images.push(await driver.capture());
  }
  return { payload: { ...payload, cards }, images, overflow };
}

/**
 * Segments markdown into 3:4 cards and rasterizes them (1242×1656 for 3:4)
 * in an offscreen BrowserWindow, waiting for fonts and images before each capture.
 */
export async function rasterizeSocialCards(params: GenerateSocialCardsParams): Promise<GeneratedCardsResult> {
  const { aspectRatio = '3:4', maxCards = 9 } = params;
  const spec = PLATFORM_COVER_SPECS[aspectRatio] || PLATFORM_COVER_SPECS['3:4'];
  if (maxCards <= 0) {
    const payload = renderXiaohongshuCards(params.markdown, { fallbackTitle: params.title, coverRatio: aspectRatio });
    return { imagePaths: [], captionText: payload.captionText, tags: payload.tags };
  }

  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width: spec.width,
    height: spec.height,
    show: false,
    useContentSize: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: false },
  };
  let win: Electron.BrowserWindow;
  if (params.browserWindowFactory) {
    win = params.browserWindowFactory(winOpts);
  } else {
    const electron = await import('electron');
    if (!electron.BrowserWindow) throw new Error('当前环境不支持创建 Electron BrowserWindow 离屏窗口');
    win = new electron.BrowserWindow(winOpts);
  }

  const driver: CardPageDriver = {
    load: async (html) => {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    },
    evaluate: (script) => win.webContents.executeJavaScript(script),
    capture: async () => (await win.webContents.capturePage({ x: 0, y: 0, width: spec.width, height: spec.height })).toPNG(),
  };

  try {
    const { payload, images } = await renderCardDeck(driver, params);
    const tmpDir = path.join(os.tmpdir(), 'vmark_social_cards', `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const imagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const filePath = path.join(tmpDir, `card_${String(i + 1).padStart(2, '0')}.png`);
      await fs.writeFile(filePath, images[i]);
      imagePaths.push(filePath);
    }
    return { imagePaths, captionText: payload.captionText, tags: payload.tags };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
