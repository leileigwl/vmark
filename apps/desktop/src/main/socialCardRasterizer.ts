import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type Electron from 'electron';
import { renderXiaohongshuCards, renderSocialCardHtml } from '@vcat/core';

export interface GenerateSocialCardsParams {
  markdown: string;
  title?: string;
  themeId?: string;
  brandName?: string;
  maxCards?: number;
  browserWindowFactory?: (opts: Electron.BrowserWindowConstructorOptions) => Electron.BrowserWindow;
}

export interface GeneratedCardsResult {
  imagePaths: string[];
  captionText: string;
  tags: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Automatically segments markdown into structured 3:4 cards and rasterizes them
 * into 1080x1440 PNG images using an offscreen BrowserWindow.
 */
export async function rasterizeSocialCards(
  params: GenerateSocialCardsParams
): Promise<GeneratedCardsResult> {
  const { markdown, title = '技术笔记', themeId = 'geek-dark', brandName = 'Vmark', maxCards = 9 } = params;

  const notePayload = renderXiaohongshuCards(markdown, title);
  const cardSections = notePayload.cards.slice(0, maxCards);

  if (cardSections.length === 0) {
    return {
      imagePaths: [],
      captionText: notePayload.captionText,
      tags: notePayload.tags,
    };
  }

  const tmpDir = path.join(os.tmpdir(), 'vmark_social_cards', `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width: 1080,
    height: 1440,
    show: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      webSecurity: false,
    },
  };

  let win: Electron.BrowserWindow;
  if (params.browserWindowFactory) {
    win = params.browserWindowFactory(winOpts);
  } else {
    const electron = await import('electron');
    const BrowserWindowClass = electron.BrowserWindow;
    if (!BrowserWindowClass) {
      throw new Error('当前环境不支持创建 Electron BrowserWindow 离屏窗口');
    }
    win = new BrowserWindowClass(winOpts);
  }

  const imagePaths: string[] = [];

  try {
    for (let i = 0; i < cardSections.length; i++) {
      const card = cardSections[i];
      const html = renderSocialCardHtml(card, {
        themeId,
        cardIndex: i,
        totalCards: cardSections.length,
        brandName,
      });

      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      // Wait a tick for web font rendering and layout stabilization
      await sleep(150);

      const image = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: 1080,
        height: 1440,
      });

      const pngBuffer = image.toPNG();
      const filePath = path.join(tmpDir, `card_${String(i + 1).padStart(2, '0')}.png`);
      await fs.writeFile(filePath, pngBuffer);
      imagePaths.push(filePath);
    }
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }

  return {
    imagePaths,
    captionText: notePayload.captionText,
    tags: notePayload.tags,
  };
}
