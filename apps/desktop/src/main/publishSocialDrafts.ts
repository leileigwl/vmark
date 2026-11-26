import { BrowserWindow } from 'electron';
import type Electron from 'electron';
import { markdownToPlainText } from '@vcat/core';
import { SOCIAL_MAX_CARDS, type MultiPlatformPublishPayload, type MultiPlatformPublishResultItem } from '@vcat/shared';
import { attachInternalBrowserStealth } from './internalBrowserManager';
import { hasSessionAuthCookies, type PublishAppConfig } from './publishSessionAuth';
import { rasterizeSocialCards } from './socialCardRasterizer';
import { pickSocialTheme, resolveSocialUploadImages } from './socialUploadImages';
import { DOUYIN_DRAFT_SPEC, XHS_DRAFT_SPEC, runSocialDraftFlow, type DraftPage, type SocialDraftSpec } from './socialDraftPage';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DEFAULT_MAX_CARDS = 18;
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
      maxCards: SOCIAL_MAX_CARDS[platformId] ?? DEFAULT_MAX_CARDS,
      coverImagePath: payload.socialCoverImagePath,
    },
    rasterizeSocialCards
  );
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
    const [winW, winH] = win.getContentSize();
    for (const nodeId of [...nodeIds].reverse()) {
      await win.webContents.debugger.sendCommand('DOM.scrollIntoViewIfNeeded', { nodeId }).catch(() => null);
      const box = await win.webContents.debugger
        .sendCommand('DOM.getBoxModel', { nodeId })
        .catch(() => null);
      const quad = box?.model?.content;
      if (quad && quad.length >= 8) {
        const x = Math.round((quad[0] + quad[4]) / 2);
        const y = Math.round((quad[1] + quad[5]) / 2);
        if (x > 0 && y > 0 && x < winW && y < winH) {
          win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
          win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          await sleep(40);
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

function windowDriver(win: BrowserWindow): DraftPage {
  return {
    eval: (script) => win.webContents.executeJavaScript(script),
    setFiles: (selector, files) => setInputFilesViaDebugger(win, selector, files),
    sleep,
    clickTextFallback: (text) => clickTextViaDebugger(win, text).catch(() => false),
  };
}

type SocialPlatform = 'xiaohongshu' | 'douyin';

const SOCIAL: Record<SocialPlatform, { name: string; entryUrl: string; draftsUrl: string; spec: SocialDraftSpec }> = {
  // 带 target=image 仍可能停在「上传视频」，流程里会再点「上传图文」tab。
  xiaohongshu: {
    name: '小红书',
    entryUrl: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image',
    // 小红书图文草稿存在发布页所在浏览器本地（同一个 persist:platform_xiaohongshu 分区），从发布页的草稿箱打开。
    draftsUrl: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image',
    spec: XHS_DRAFT_SPEC,
  },
  douyin: {
    name: '抖音',
    entryUrl: 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
    // 抖音未发布图文草稿在发布页「继续编辑」横幅恢复，不在 /content/manage 已发布列表里。
    draftsUrl: 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
    spec: DOUYIN_DRAFT_SPEC,
  },
};

/** 小红书/抖音图文：上传生成的全部卡片（逐张确认）、填标题与纯文本正文、点暂存草稿。 */
async function publishSocialDraft(platformId: SocialPlatform, params: {
  session: typeof Electron.session;
  payload: MultiPlatformPublishPayload;
  cfg: PublishAppConfig;
}): Promise<MultiPlatformPublishResultItem> {
  const { session, payload, cfg } = params;
  const meta = SOCIAL[platformId];
  const fail = (message: string): MultiPlatformPublishResultItem => ({ platformId, ok: false, mode: 'draft', message });
  if (!(await hasSessionAuthCookies(session, platformId))) return fail(`未登录${meta.name}，请先在发布窗口里登录${meta.name}`);

  const files = await resolveUploadImages(platformId, cfg.workspacePath, payload);
  if (files.length === 0) return fail(`${meta.name}图文未能生成卡片图片，请检查文章内容后重试`);

  const partition = `persist:platform_${platformId}`;
  const targetSession = session.fromPartition(partition);
  attachInternalBrowserStealth(targetSession, partition);
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { session: targetSession, contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadURL(meta.entryUrl);
    if (/login|passport|signin/i.test(win.webContents.getURL())) return fail(`${meta.name}登录已失效，请重新登录后再推送`);
    const title = (payload.title || '无标题').trim();
    // 用户在小红书/抖音分区里写了正文就用他写的，否则从 Markdown 生成纯文本。
    const body = payload.socialBody?.trim() || markdownToPlainText(payload.markdown, { title });
    const res = await runSocialDraftFlow(windowDriver(win), meta.spec, { files, title, body, tags: payload.tags });
    await sleep(3000);
    const note = res.warnings.length ? `；${res.warnings.join('；')}` : '';
    return {
      platformId,
      ok: true,
      mode: 'draft',
      url: meta.draftsUrl,
      verified: res.warnings.length === 0,
      uploadedImagesCount: res.uploaded,
      message: `已暂存到${meta.name}图文草稿箱（上传 ${res.uploaded}/${files.length} 张图）${note}`,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Saves an image-text draft to Xiaohongshu creator center using isolated session browser automation. */
export function publishXiaohongshuDraft(params: Parameters<typeof publishSocialDraft>[1]): Promise<MultiPlatformPublishResultItem> {
  return publishSocialDraft('xiaohongshu', params);
}

/** Saves an image-text draft to Douyin creator center using isolated session browser automation. */
export function publishDouyinDraft(params: Parameters<typeof publishSocialDraft>[1]): Promise<MultiPlatformPublishResultItem> {
  return publishSocialDraft('douyin', params);
}
