import type Electron from 'electron';
import { createImageBedUploader, uploadLocalImagesForPublish } from '@vcat/image-pipeline';
import type { MultiPlatformPublishPayload, MultiPlatformPublishResultItem } from '@vcat/shared';
import { createSessionFetch, hasSessionAuthCookies, type PublishAppConfig } from './publishSessionAuth';

/** Publishes a draft to Cnblogs via Web API with automatic XSRF-TOKEN and image upload. */
export async function publishCnblogsWebDraft(params: {
  session: typeof Electron.session;
  payload: MultiPlatformPublishPayload;
  cfg: PublishAppConfig;
  includeRemote: boolean;
}): Promise<MultiPlatformPublishResultItem> {
  const { session, payload, cfg, includeRemote } = params;
  const cnblogsSession = session.fromPartition('persist:platform_cnblogs');
  const hasCookies = await hasSessionAuthCookies(session, 'cnblogs');
  if (!hasCookies) {
    return {
      platformId: 'cnblogs',
      ok: false,
      mode: 'draft',
      message: '未登录博客园，请先在「偏好设置 → 平台授权托管」完成登录授权',
    };
  }

  const sFetch = createSessionFetch(cnblogsSession);
  await sFetch('https://i.cnblogs.com/posts/edit', {
    headers: { Referer: 'https://i.cnblogs.com/' },
  }).catch(() => {});

  const xsrfCookies = await cnblogsSession.cookies.get({ name: 'XSRF-TOKEN' });
  const xsrfToken = xsrfCookies[0]?.value ?? '';

  const uploadCnblogsImage = async (buffer: Buffer, fileName: string): Promise<string> => {
    if (cfg.imageBed.strategy === 'custom_oss' && cfg.imageBed.provider) {
      return createImageBedUploader()(buffer, fileName, cfg.imageBed);
    }
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(buffer)]), fileName);
    form.append('app', 'blog');
    form.append('uploadType', 'Select');
    const upRes = await sFetch('https://upload.cnblogs.com/v2/images/cors-upload', {
      method: 'POST',
      headers: {
        Origin: 'https://i.cnblogs.com',
        Referer: 'https://i.cnblogs.com/',
        ...(xsrfToken ? { 'x-xsrf-token': xsrfToken } : {}),
      },
      body: form,
    });
    if (!upRes.ok) {
      throw new Error(`博客园图片上传失败: HTTP ${upRes.status}`);
    }
    const upData = (await upRes.json()) as { data?: string; url?: string; imageUrl?: string; src?: string };
    const url = upData.data || upData.url || upData.imageUrl || upData.src;
    if (!url) throw new Error('博客园图片上传未返回 URL');
    return url;
  };

  const uploadResult = await uploadLocalImagesForPublish({
    workspacePath: cfg.workspacePath,
    markdown: payload.markdown,
    config: cfg.imageBed,
    includeRemote,
    uploadFn: uploadCnblogsImage,
  });
  if (uploadResult.errors.length > 0) {
    return { platformId: 'cnblogs', ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
  }

  const res = await sFetch('https://i.cnblogs.com/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Origin: 'https://i.cnblogs.com',
      Referer: 'https://i.cnblogs.com/posts/edit',
      ...(xsrfToken ? { 'x-xsrf-token': xsrfToken } : {}),
    },
    body: JSON.stringify({
      title: payload.title,
      postType: 1,
      postBody: uploadResult.markdown,
      isDraft: true,
      isMarkdown: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(errText) as { errors?: string[] };
      if (json.errors && json.errors.length > 0) errMsg = json.errors.join(', ');
    } catch {
      // non-JSON response
    }
    if (errMsg.includes('您没有开通博客')) {
      errMsg = '博客园账号尚未开通个人博客空间，请访问 https://i.cnblogs.com/ 申请开通后重试';
    }
    return { platformId: 'cnblogs', ok: false, mode: 'draft', message: `博客园发布接口返回失败: ${errMsg}` };
  }

  const postData = (await res.json()) as { id?: string | number };
  const postId = postData.id ? String(postData.id) : 'draft';
  return {
    platformId: 'cnblogs',
    ok: true,
    mode: 'draft',
    postId,
    url: `https://i.cnblogs.com/posts/edit;postId=${postId}`,
    verified: true,
    uploadedImagesCount: uploadResult.uploadedCount,
    message: `已成功保存至博客园草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
  };
}
