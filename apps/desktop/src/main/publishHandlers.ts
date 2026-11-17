import fs from 'node:fs/promises';
import path from 'node:path';
import type Electron from 'electron';
import { renderWeixinHtml } from '@vcat/core/weixin';
import { uploadLocalImagesForPublish } from '@vcat/image-pipeline';
import { WeixinAdapter, type FetchLike } from '@vcat/adapters';

export interface WeixinDraftIpcPayload {
  title: string;
  markdown: string;
  author?: string;
  digest?: string;
  coverImageUrl?: string;
  showCoverInBody?: boolean;
  sourceUrl?: string;
}

export type WeixinDraftIpcResult =
  | { ok: true; postId: string; url: string; verified: boolean }
  | { ok: false; message: string };

/** Wraps an Electron Session's fetch method into the FetchLike contract expected by adapters. */
function createSessionFetch(wxSession: Electron.Session): FetchLike {
  return async (input, init) => {
    const res = await wxSession.fetch(input, init as Parameters<typeof wxSession.fetch>[1]);
    return {
      ok: res.ok,
      status: res.status,
      text: () => res.text(),
      json: () => res.json(),
    };
  };
}

/** Registers main-process IPC handlers for publishing articles to external platforms. */
export function registerPublishHandlers(params: {
  ipcMain: Electron.IpcMain;
  session: typeof Electron.session;
  getWorkspacePath: () => string | null | Promise<string | null>;
}): void {
  const { ipcMain, session, getWorkspacePath } = params;

  ipcMain.handle(
    'publish:weixinDraft',
    async (_event, payload: WeixinDraftIpcPayload): Promise<WeixinDraftIpcResult> => {
      try {
        const wxSession = session.fromPartition('persist:vcat-weixin');
        const adapter = new WeixinAdapter(createSessionFetch(wxSession));

        const authed = await adapter.checkAuth();
        if (!authed) {
          return {
            ok: false,
            message: '微信公众号未登录，请先在「偏好设置 → 平台授权托管」完成扫码登录',
          };
        }

        const workspacePath = await getWorkspacePath();
        let processedMarkdown = payload.markdown;

        if (workspacePath) {
          const uploadResult = await uploadLocalImagesForPublish({
            workspacePath,
            markdown: payload.markdown,
            config: { strategy: 'platform_private' },
            uploadFn: async (buffer, fileName) => adapter.uploadImage(buffer, fileName),
          });
          if (uploadResult.errors.length > 0) {
            return { ok: false, message: uploadResult.errors.join('；') };
          }
          processedMarkdown = uploadResult.markdown;
        }

        let resolvedCoverUrl = payload.coverImageUrl?.trim() || undefined;
        if (resolvedCoverUrl && !/^https?:\/\//i.test(resolvedCoverUrl) && workspacePath) {
          const resolvedRoot = path.resolve(workspacePath);
          const cleanRel = resolvedCoverUrl.replace(/^\.\//, '');
          const fullCoverPath = path.resolve(resolvedRoot, cleanRel);
          if (!fullCoverPath.startsWith(`${resolvedRoot}${path.sep}`)) {
            return { ok: false, message: `非法封面图路径: ${resolvedCoverUrl}` };
          }
          const coverBuffer = await fs.readFile(fullCoverPath);
          resolvedCoverUrl = await adapter.uploadImage(coverBuffer, path.basename(fullCoverPath));
        }

        const rendered = renderWeixinHtml(processedMarkdown, {
          coverImageUrl: resolvedCoverUrl,
          showCoverInBody: payload.showCoverInBody,
        });

        const pushed = await adapter.push({
          title: payload.title,
          markdown: processedMarkdown,
          html: rendered.html,
          tags: [],
          mode: 'draft',
          author: payload.author,
          digest: payload.digest?.trim() ? payload.digest : rendered.digest,
          coverImageUrl: resolvedCoverUrl,
          showCoverInBody: payload.showCoverInBody,
          sourceUrl: payload.sourceUrl,
        });

        return {
          ok: true,
          postId: pushed.postId,
          url: pushed.url,
          verified: pushed.verified,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );
}
