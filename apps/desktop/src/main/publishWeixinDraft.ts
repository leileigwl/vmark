import fs from 'node:fs/promises';
import path from 'node:path';
import type Electron from 'electron';
import { WeixinAdapter } from '@vcat/adapters';
import { renderWeixinHtml } from '@vcat/core';
import { resolveRefererForUrl, uploadLocalImagesForPublish } from '@vcat/image-pipeline';
import { createSessionFetch } from './publishSessionAuth';

export interface WeixinDraftIpcPayload {
  title: string;
  markdown: string;
  author?: string;
  digest?: string;
  coverImageUrl?: string;
  showCoverInBody?: boolean;
  sourceUrl?: string;
  includeRemoteImages?: boolean;
}

export type WeixinDraftIpcResult =
  | { ok: true; postId: string; url: string; verified: boolean; uploadedImagesCount?: number }
  | { ok: false; message: string };

async function resolveWeixinCoverUrl(params: {
  coverImageUrl?: string;
  workspacePath: string | null;
  adapter: WeixinAdapter;
  includeRemote: boolean;
}): Promise<{ ok: true; url?: string } | { ok: false; message: string }> {
  const raw = params.coverImageUrl?.trim();
  if (!raw) return { ok: true, url: undefined };

  if (!/^https?:\/\//i.test(raw)) {
    if (!params.workspacePath) {
      return { ok: false, message: `未配置工作区路径，无法读取本地封面图: ${raw}` };
    }
    const resolvedRoot = path.resolve(params.workspacePath);
    const cleanRel = raw.replace(/^\.\//, '');
    const fullCoverPath = path.resolve(resolvedRoot, cleanRel);
    if (!fullCoverPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      return { ok: false, message: `非法封面图路径: ${raw}` };
    }
    const coverBuffer = await fs.readFile(fullCoverPath);
    const url = await params.adapter.uploadImage(coverBuffer, path.basename(fullCoverPath));
    return { ok: true, url };
  }

  if (!params.includeRemote || raw.includes('mmbiz.qpic.cn')) {
    return { ok: true, url: raw };
  }

  const referer = resolveRefererForUrl(raw);
  const res = await fetch(raw, {
    headers: {
      ...(referer ? { Referer: referer } : {}),
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    return { ok: false, message: `抓取封面图失败 (${res.status}): ${raw}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const url = await params.adapter.uploadImage(buffer, 'cover.png');
  return { ok: true, url };
}

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

  const coverRes = await resolveWeixinCoverUrl({
    coverImageUrl: payload.coverImageUrl,
    workspacePath,
    adapter,
    includeRemote,
  });
  if (!coverRes.ok) {
    return { ok: false, message: coverRes.message };
  }

  const rendered = renderWeixinHtml(uploadResult.markdown, {
    coverImageUrl: coverRes.url,
    showCoverInBody: payload.showCoverInBody,
  });

  const pushed = await adapter.push({
    title: payload.title,
    markdown: uploadResult.markdown,
    html: rendered.html,
    tags: [],
    mode: 'draft',
    author: payload.author,
    digest: payload.digest?.trim() ? payload.digest : rendered.digest,
    coverImageUrl: coverRes.url,
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
