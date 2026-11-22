import type Electron from 'electron';
import { WeixinAdapter } from '@vcat/adapters';
import { renderWeixinHtml } from '@vcat/core';
import { uploadLocalImagesForPublish } from '@vcat/image-pipeline';
import { rasterizeMarkdownLatexForPlatform } from './latexRasterizer';
import { createSessionFetch } from './publishSessionAuth';
import { resolveWeixinCovers } from './publishWeixinCover';

export interface WeixinDraftIpcPayload {
  title: string;
  markdown: string;
  author?: string;
  digest?: string;
  coverImageUrl?: string;
  showCoverInBody?: boolean;
  sourceUrl?: string;
  includeRemoteImages?: boolean;
  /** 按焦点裁好的 1:1 转发图（工作区相对路径）。 */
  weixinSquareCoverImagePath?: string;
}

export type WeixinDraftIpcResult =
  | { ok: true; postId: string; url: string; verified: boolean; uploadedImagesCount?: number }
  | { ok: false; message: string };

/** Uploads images, renders styled WeChat HTML, and pushes a draft to the Official Account box. */
export async function executeWeixinDraftPublish(params: {
  session: typeof Electron.session;
  workspacePath: string | null;
  payload: WeixinDraftIpcPayload;
}): Promise<WeixinDraftIpcResult> {
  const { session, workspacePath, payload } = params;
  const wxSession = session.fromPartition('persist:platform_weixin');
  const adapter = new WeixinAdapter(createSessionFetch(wxSession));

  const authed = await adapter.checkAuth();
  if (!authed) {
    return {
      ok: false,
      message: '微信公众号未登录，请先在「偏好设置 → 平台授权托管」完成扫码登录',
    };
  }

  const includeRemote = payload.includeRemoteImages ?? true;
  const uploadResult = await uploadLocalImagesForPublish({
    workspacePath,
    markdown: payload.markdown,
    config: { strategy: 'platform_private' },
    includeRemote,
    skipHosts: ['mmbiz.qpic.cn'],
    uploadFn: async (buffer, fileName) => adapter.uploadImage(buffer, fileName),
  });
  if (uploadResult.errors.length > 0) {
    return { ok: false, message: uploadResult.errors.join('；') };
  }

  const coverRes = await resolveWeixinCovers({
    coverImageUrl: payload.coverImageUrl,
    squareImagePath: payload.weixinSquareCoverImagePath,
    workspacePath,
    upload: (buffer, fileName) => adapter.uploadImage(buffer, fileName),
    includeRemote,
  });
  if (!coverRes.ok) {
    return { ok: false, message: coverRes.message };
  }

  const latexRes = await rasterizeMarkdownLatexForPlatform({
    markdown: uploadResult.markdown,
    uploadFn: async (buffer, fileName) => adapter.uploadImage(buffer, fileName),
  });

  const rendered = renderWeixinHtml(latexRes.markdown, {
    coverImageUrl: coverRes.url,
    showCoverInBody: payload.showCoverInBody,
  });

  const pushed = await adapter.push({
    title: payload.title,
    markdown: latexRes.markdown,
    html: rendered.html,
    tags: [],
    mode: 'draft',
    author: payload.author,
    digest: payload.digest?.trim() ? payload.digest : rendered.digest,
    coverImageUrl: coverRes.url,
    coverSquareImageUrl: coverRes.squareUrl,
    showCoverInBody: payload.showCoverInBody,
    sourceUrl: payload.sourceUrl,
  });

  return {
    ok: true,
    postId: pushed.postId,
    url: pushed.url,
    verified: pushed.verified,
    uploadedImagesCount: uploadResult.uploadedCount,
  };
}
