import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type Electron from 'electron';
import { PLATFORM_COVER_SPECS, renderXiaohongshuCards } from '@vcat/core';
import { DEFAULT_MAX_CARDS, renderCardDeck, type CardDeckParams, type CardPageDriver } from './socialCardDeck.ts';
import { getCardMathRenderer } from './socialCardMath.ts';

export { renderCardDeck, type CardPageDriver } from './socialCardDeck.ts';

export interface GenerateSocialCardsParams extends CardDeckParams {
  browserWindowFactory?: (opts: Electron.BrowserWindowConstructorOptions) => Electron.BrowserWindow;
}

export interface GeneratedCardsResult {
  imagePaths: string[];
  captionText: string;
  tags: string[];
}

/**
 * Segments markdown into 3:4 cards and rasterizes them (1242×1656 for 3:4)
 * in an offscreen BrowserWindow, waiting for fonts and images before each capture.
 */
export async function rasterizeSocialCards(params: GenerateSocialCardsParams): Promise<GeneratedCardsResult> {
  const { aspectRatio = '3:4', maxCards = DEFAULT_MAX_CARDS } = params;
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

  // 公式用 KaTeX 排版；加载失败时退回 Unicode 近似，不影响出图（WAIT_READY 会等 KaTeX 字体）
  const math = await getCardMathRenderer().catch(() => undefined);

  try {
    const { payload, images } = await renderCardDeck(driver, params, math);
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
