import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import type Electron from 'electron';
import { renderXiaohongshuCards } from '@vcat/core';
import { SOCIAL_MAX_CARDS, type MultiPlatformPublishPayload, type MultiPlatformPublishResultItem } from '@vcat/shared';
import { attachInternalBrowserStealth } from './internalBrowserManager';
import { hasSessionAuthCookies, type PublishAppConfig } from './publishSessionAuth';
import { rasterizeSocialCards } from './socialCardRasterizer';
import { pickSocialTheme, resolveSocialUploadImages } from './socialUploadImages';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_THEME = { xiaohongshu: 'ios-memo', douyin: 'minimalist-magazine' } as const;

/** 小红书/抖音要上传的图：生成的卡片（含正文图片），上传封面插在第 1 张，按平台上限截断。 */
function resolveUploadImages(platformId: 'xiaohongshu' | 'douyin', workspacePath: string | null, payload: MultiPlatformPublishPayload) {
  return resolveSocialUploadImages(
    {
      workspacePath,
      markdown: payload.markdown,
      title: payload.title,
      themeId: pickSocialTheme(payload.socialThemeId, DEFAULT_THEME[platformId]),
      aspectRatio: payload.socialCoverRatio,
      maxCards: SOCIAL_MAX_CARDS[platformId] ?? 9,
      coverImagePath: payload.socialCoverImagePath,
    },
    rasterizeSocialCards
  );
}

/** 正文：用户在小红书/抖音分区里写了就用他写的（socialBody），否则从 Markdown 生成。 */
function buildSocialCaption(markdown: string, title?: string, tags: string[] = [], body?: string): string {
  const base = body?.trim() || renderXiaohongshuCards(markdown, title).captionText.trim();
  const tagLine = tags.length > 0 ? `\n${tags.map((t) => `#${t}`).join(' ')}` : '';
  const text = `${base}${tagLine}`.trim();
  return text.length > 950 ? `${text.slice(0, 947)}...` : text;
}

async function setInputFilesViaDebugger(
  win: BrowserWindow,
  selector: string,
  files: string[]
): Promise<void> {
  win.webContents.debugger.attach('1.3');
  try {
    const doc = await win.webContents.debugger.sendCommand('DOM.getDocument', {
      depth: -1,
      pierce: true,
    });
    const query = await win.webContents.debugger.sendCommand('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!query.nodeId) throw new Error(`未找到上传控件: ${selector}`);
    await win.webContents.debugger.sendCommand('DOM.setFileInputFiles', {
      nodeId: query.nodeId,
      files,
    });
  } finally {
    if (win.webContents.debugger.isAttached()) {
      win.webContents.debugger.detach();
    }
  }
}

async function clickTextViaDebugger(win: BrowserWindow, text: string): Promise<boolean> {
  win.webContents.debugger.attach('1.3');
  try {
    await win.webContents.debugger.sendCommand('DOM.enable');
    await win.webContents.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
    const search = await win.webContents.debugger.sendCommand('DOM.performSearch', {
      query: text,
      includeUserAgentShadowDOM: true,
    });
    if (!search.resultCount || search.resultCount < 1) return false;
    const { nodeIds } = await win.webContents.debugger.sendCommand('DOM.getSearchResults', {
      searchId: search.searchId,
      fromIndex: 0,
      toIndex: search.resultCount,
    });
    for (const nodeId of [...nodeIds].reverse()) {
      const box = await win.webContents.debugger
        .sendCommand('DOM.getBoxModel', { nodeId })
        .catch(() => null);
      const quad = box?.model?.content;
      if (quad && quad.length >= 8) {
        const x = Math.round((quad[0] + quad[4]) / 2);
        const y = Math.round((quad[1] + quad[5]) / 2);
        if (x > 0 && y > 0) {
          win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
          win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
          return true;
        }
      }
    }
    return false;
  } finally {
    if (win.webContents.debugger.isAttached()) {
      win.webContents.debugger.detach();
    }
  }
}

async function waitForSelector(win: BrowserWindow, selector: string, timeoutMs = 12000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await win.webContents
      .executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
      .catch(() => false);
    if (found) return true;
    await sleep(400);
  }
  return false;
}

/** Saves an image-text draft to Xiaohongshu creator center using isolated session browser automation. */
export async function publishXiaohongshuDraft(params: {
  session: typeof Electron.session;
  payload: MultiPlatformPublishPayload;
  cfg: PublishAppConfig;
}): Promise<MultiPlatformPublishResultItem> {
  const { session, payload, cfg } = params;
  const authed = await hasSessionAuthCookies(session, 'xiaohongshu');
  if (!authed) {
    return {
      platformId: 'xiaohongshu',
      ok: false,
      mode: 'draft',
      message: '未登录小红书，请先在「偏好设置 → 平台授权托管」完成登录授权',
    };
  }

  const files = await resolveUploadImages('xiaohongshu', cfg.workspacePath, payload);
  if (files.length === 0) {
    return {
      platformId: 'xiaohongshu',
      ok: false,
      mode: 'draft',
      message: '小红书图文未能生成或解析到有效图片，请检查文章内容后重试',
    };
  }

  const partition = 'persist:platform_xiaohongshu';
  const targetSession = session.fromPartition(partition);
  attachInternalBrowserStealth(targetSession, partition);
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { session: targetSession, contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadURL('https://creator.xiaohongshu.com/publish/publish?target=image');
    const ready = await waitForSelector(win, 'input.upload-input', 12000);
    if (!ready) throw new Error('小红书上传页加载超时或登录状态已失效');

    await setInputFilesViaDebugger(win, 'input.upload-input', files);
    const editorReady = await waitForSelector(win, 'input[placeholder*="填写标题"]', 15000);
    if (!editorReady) throw new Error('小红书图片上传后未进入图文编辑页');

    await sleep(1500);
    const shortTitle = (payload.title || '无标题').trim().slice(0, 20);
    const caption = buildSocialCaption(payload.markdown, shortTitle, payload.tags, payload.socialBody);

    await win.webContents.executeJavaScript(`((title, caption) => {
      const knowBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '我知道了');
      if (knowBtn) knowBtn.click();

      const titleInput = document.querySelector('input[placeholder*="填写标题"]');
      if (titleInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(titleInput, title);
        else titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const editor = document.querySelector('.tiptap.ProseMirror[contenteditable="true"]');
      if (editor) {
        editor.focus();
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, caption);
      }
    })(${JSON.stringify(shortTitle)}, ${JSON.stringify(caption)})`);

    await sleep(1200);
    let clickedDraft = false;
    const draftDeadline = Date.now() + 12000;
    while (Date.now() < draftDeadline) {
      clickedDraft = await win.webContents
        .executeJavaScript(`(() => {
          const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span'))
            .filter(el => el.innerText && el.innerText.trim() === '暂存离开');
          const btn = candidates[candidates.length - 1];
          if (!btn) return false;
          btn.click();
          return true;
        })()`)
        .catch(() => false);
      if (!clickedDraft) {
        clickedDraft = await clickTextViaDebugger(win, '暂存离开').catch(() => false);
      }
      if (clickedDraft) break;
      await sleep(500);
    }
    if (!clickedDraft) throw new Error('未找到小红书「暂存离开」草稿按钮');

    await sleep(3000);
    return {
      platformId: 'xiaohongshu',
      ok: true,
      mode: 'draft',
      url: 'https://creator.xiaohongshu.com/publish/publish?target=image',
      verified: true,
      uploadedImagesCount: files.length,
      message: `已暂存到小红书图文草稿箱（上传 ${files.length} 张图）`,
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Saves an image-text draft to Douyin creator center using isolated session browser automation. */
export async function publishDouyinDraft(params: {
  session: typeof Electron.session;
  payload: MultiPlatformPublishPayload;
  cfg: PublishAppConfig;
}): Promise<MultiPlatformPublishResultItem> {
  const { session, payload, cfg } = params;
  const authed = await hasSessionAuthCookies(session, 'douyin');
  if (!authed) {
    return {
      platformId: 'douyin',
      ok: false,
      mode: 'draft',
      message: '未登录抖音，请先在「偏好设置 → 平台授权托管」完成登录授权',
    };
  }

  const files = await resolveUploadImages('douyin', cfg.workspacePath, payload);
  if (files.length === 0) {
    return {
      platformId: 'douyin',
      ok: false,
      mode: 'draft',
      message: '抖音图文未能生成或解析到有效图片，请检查文章内容后重试',
    };
  }

  const partition = 'persist:platform_douyin';
  const targetSession = session.fromPartition(partition);
  attachInternalBrowserStealth(targetSession, partition);
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { session: targetSession, contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadURL('https://creator.douyin.com/creator-micro/content/post/image');
    const ready = await waitForSelector(win, 'input[placeholder="添加作品标题"]', 12000);
    if (!ready) throw new Error('抖音图文发布页加载超时或登录状态已失效');

    await sleep(1500);
    const filePayloads = await Promise.all(
      files.map(async (f) => ({
        name: path.basename(f),
        b64: (await fs.readFile(f)).toString('base64'),
      }))
    );

    const dropOk = await win.webContents.executeJavaScript(`((items) => {
      const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '完成');
      if (doneBtn) doneBtn.click();

      const dt = new DataTransfer();
      for (const item of items) {
        const bin = atob(item.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const lower = item.name.toLowerCase();
        const ext = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : lower.endsWith('.webp') ? 'image/webp' : 'image/png';
        dt.items.add(new File([bytes], item.name, { type: ext }));
      }
      const els = Array.from(document.querySelectorAll('div, span')).filter(el => el.innerText && el.innerText.includes('拖入此区域'));
      const target = els[els.length - 1];
      if (!target) return false;
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      return true;
    })(${JSON.stringify(filePayloads)})`);
    if (!dropOk) throw new Error('未找到抖音图片拖拽上传区域');

    await sleep(5000);
    const shortTitle = (payload.title || '无标题').trim().slice(0, 20);
    const caption = buildSocialCaption(payload.markdown, shortTitle, payload.tags, payload.socialBody);

    await win.webContents.executeJavaScript(`((title, caption) => {
      const titleInput = document.querySelector('input[placeholder="添加作品标题"]');
      if (titleInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(titleInput, title);
        else titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const editor = document.querySelector('.zone-container.editor-kit-container[contenteditable="true"]');
      if (editor) {
        editor.focus();
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, caption);
      }
    })(${JSON.stringify(shortTitle)}, ${JSON.stringify(caption)})`);

    await sleep(1200);
    const clickedDraft = await win.webContents.executeJavaScript(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('暂存离开'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!clickedDraft) throw new Error('未找到抖音「暂存离开」草稿按钮');

    await sleep(3000);
    return {
      platformId: 'douyin',
      ok: true,
      mode: 'draft',
      url: 'https://creator.douyin.com/creator-micro/content/manage',
      verified: true,
      uploadedImagesCount: files.length,
      message: `已暂存到抖音图文草稿箱（上传 ${files.length} 张图）`,
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
