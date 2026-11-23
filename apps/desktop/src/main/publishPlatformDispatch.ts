import type Electron from 'electron';
import {
  BaijiahaoAdapter,
  BilibiliAdapter,
  CsdnAdapter,
  GitHubStaticAdapter,
  JuejinAdapter,
  WeiboAdapter,
  ZhihuAdapter,
} from '@vcat/adapters';
import { parseCsdnMarkdown, renderBaijiahaoHtml, renderZhihuHtml } from '@vcat/core';
import { createImageBedUploader, uploadLocalImagesForPublish } from '@vcat/image-pipeline';
import type {
  MultiPlatformPublishPayload,
  MultiPlatformPublishResultItem,
  PlatformId,
  PublishMode,
} from '@vcat/shared';
import { rasterizeMarkdownLatexForPlatform } from './latexRasterizer';
import { publishCnblogsWebDraft } from './publishCnblogsDraft';
import {
  createSessionFetch,
  hasSessionAuthCookies,
  type PublishAppConfig,
} from './publishSessionAuth';
import { publishDouyinDraft, publishXiaohongshuDraft } from './publishSocialDrafts';
import { executeWeixinDraftPublish } from './publishWeixinDraft';
import { buildJuejinPush } from './publishJuejinDraft';

/** Dispatches a single-platform publish or draft action with image transfer and auth checks. */
export async function publishToSingleTarget(params: {
  platformId: PlatformId;
  mode: PublishMode;
  payload: MultiPlatformPublishPayload;
  cfg: PublishAppConfig;
  session: typeof Electron.session;
}): Promise<MultiPlatformPublishResultItem> {
  const { platformId, mode, payload, cfg, session } = params;
  const includeRemote = payload.includeRemoteImages ?? true;

  const resolveUploadFn = (platformAdapter?: { uploadImage: (buf: Buffer, name: string) => Promise<string> }) => {
    if (cfg.imageBed.strategy === 'custom_oss' && cfg.imageBed.provider) {
      return createImageBedUploader();
    }
    return async (buffer: Buffer, fileName: string) => {
      if (platformAdapter) {
        try {
          return await platformAdapter.uploadImage(buffer, fileName);
        } catch (err) {
          if (cfg.imageBed.provider) {
            return await createImageBedUploader()(buffer, fileName, cfg.imageBed);
          }
          throw err;
        }
      }
      return await createImageBedUploader()(buffer, fileName, cfg.imageBed);
    };
  };

  try {
    if (platformId === 'weixin') {
      const res = await executeWeixinDraftPublish({
        session,
        workspacePath: cfg.workspacePath,
        payload: { ...payload, includeRemoteImages: includeRemote },
      });
      if (!res.ok) {
        return { platformId, ok: false, mode: 'draft', message: res.message };
      }
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: res.postId,
        url: res.url,
        verified: res.verified,
        uploadedImagesCount: res.uploadedImagesCount,
        message: `已推送到公众号草稿箱（转存 ${res.uploadedImagesCount ?? 0} 张图）`,
      };
    }

    if (platformId === 'github_static') {
      if (
        cfg.imageBed.provider !== 'github' ||
        !cfg.imageBed.repo?.trim() ||
        !cfg.imageBed.token?.trim()
      ) {
        return {
          platformId,
          ok: false,
          mode,
          message: '请先在「偏好设置 → 图像与图床 → GitHub」配置仓库与 Token',
        };
      }
      const adapter = new GitHubStaticAdapter({
        repo: cfg.imageBed.repo,
        branch: cfg.imageBed.branch || 'main',
        token: cfg.imageBed.token,
      });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return { platformId, ok: false, mode, message: 'GitHub Token 鉴权失败，请检查权限与仓库名' };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode, message: uploadResult.errors.join('；') };
      }
      const pushed = await adapter.push({
        title: payload.title,
        markdown: uploadResult.markdown,
        html: '',
        tags: payload.tags ?? [],
        mode,
      });
      return {
        platformId,
        ok: true,
        mode,
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送至 GitHub 仓库（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'cnblogs') {
      return await publishCnblogsWebDraft({ session, payload, cfg, includeRemote });
    }

    if (platformId === 'zhihu') {
      const targetSession = session.fromPartition('persist:platform_zhihu');
      const adapter = new ZhihuAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录知乎，请先在「偏好设置 → 平台授权托管」完成扫码授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const rendered = renderZhihuHtml(uploadResult.markdown);
      const pushed = await adapter.push({
        title: payload.title,
        markdown: uploadResult.markdown,
        html: rendered.html,
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到知乎专栏草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'juejin') {
      const targetSession = session.fromPartition('persist:platform_juejin');
      const adapter = new JuejinAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录稀土掘金，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const pushed = await adapter.push(buildJuejinPush(payload, uploadResult.markdown));
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到稀土掘金草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'csdn') {
      const targetSession = session.fromPartition('persist:platform_csdn');
      const adapter = new CsdnAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录 CSDN，请先在「偏好设置 → 平台授权托管」完成扫码授权',
        };
      }
      const parsed = parseCsdnMarkdown(payload.markdown, payload.title);
      const sourceMarkdown = parsed.markdown || payload.markdown;
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: sourceMarkdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: async (buffer, fileName) => adapter.uploadImage(buffer, fileName),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const csdnMarkdown = uploadResult.markdown || sourceMarkdown;
      const csdnHtml = renderBaijiahaoHtml(csdnMarkdown).html;
      try {
        const pushed = await adapter.push({
          title: payload.title || parsed.title,
          markdown: csdnMarkdown,
          html: csdnHtml,
          tags: payload.tags && payload.tags.length > 0 ? payload.tags : parsed.tags,
          mode: 'draft',
        });
        return {
          platformId,
          ok: true,
          mode: 'draft',
          postId: pushed.postId,
          url: pushed.url,
          verified: pushed.verified,
          uploadedImagesCount: uploadResult.uploadedCount,
          message: `已推送到 CSDN 草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
        };
      } catch (err) {
        let msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('博主不存在')) {
          msg = 'CSDN 账号尚未激活博主身份，请访问 https://mp.csdn.net/ 完善博主昵称与博客开通后重试';
        }
        return { platformId, ok: false, mode: 'draft', message: msg };
      }
    }

    if (platformId === 'baijiahao') {
      const targetSession = session.fromPartition('persist:platform_baijiahao');
      const adapter = new BaijiahaoAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录百家号，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const latexRes = await rasterizeMarkdownLatexForPlatform({
        markdown: uploadResult.markdown,
        uploadFn: (buf, name) => resolveUploadFn(adapter)(buf, name, cfg.imageBed),
      });
      const rendered = renderBaijiahaoHtml(latexRes.markdown);
      const pushed = await adapter.push({
        title: payload.title,
        markdown: latexRes.markdown,
        html: rendered.html,
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到百家号草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'bilibili') {
      const targetSession = session.fromPartition('persist:platform_bilibili');
      const cookies = await targetSession.cookies.get({ name: 'bili_jct' });
      const csrfToken = cookies[0]?.value ?? '';
      const adapter = new BilibiliAdapter({ csrfToken, fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录 B 站专栏，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const latexRes = await rasterizeMarkdownLatexForPlatform({
        markdown: uploadResult.markdown,
        uploadFn: (buf, name) => resolveUploadFn(adapter)(buf, name, cfg.imageBed),
      });
      const rendered = renderBaijiahaoHtml(latexRes.markdown, { tableMode: 'list' });
      const pushed = await adapter.push({
        title: payload.title,
        markdown: latexRes.markdown,
        html: rendered.html,
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到 B 站专栏草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'weibo') {
      const targetSession = session.fromPartition('persist:platform_weibo');
      const adapter = new WeiboAdapter({ fetchFn: createSessionFetch(targetSession) });
      const authed = await adapter.checkAuth();
      if (!authed) {
        return {
          platformId,
          ok: false,
          mode: 'draft',
          message: '未登录微博，请先在「偏好设置 → 平台授权托管」完成登录授权',
        };
      }
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: resolveUploadFn(adapter),
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode: 'draft', message: uploadResult.errors.join('；') };
      }
      const latexRes = await rasterizeMarkdownLatexForPlatform({
        markdown: uploadResult.markdown,
        uploadFn: (buf, name) => resolveUploadFn(adapter)(buf, name, cfg.imageBed),
      });
      const rendered = renderBaijiahaoHtml(latexRes.markdown);
      const pushed = await adapter.push({
        title: payload.title,
        markdown: latexRes.markdown,
        html: rendered.html,
        tags: payload.tags ?? [],
        mode: 'draft',
      });
      return {
        platformId,
        ok: true,
        mode: 'draft',
        postId: pushed.postId,
        url: pushed.url,
        verified: pushed.verified,
        uploadedImagesCount: uploadResult.uploadedCount,
        message: `已推送到微博头条文章草稿箱（转存 ${uploadResult.uploadedCount} 张图）`,
      };
    }

    if (platformId === 'xiaohongshu') {
      return await publishXiaohongshuDraft({ session, payload, cfg });
    }

    if (platformId === 'douyin') {
      return await publishDouyinDraft({ session, payload, cfg });
    }

    const authed = await hasSessionAuthCookies(session, platformId);
    if (!authed) {
      return {
        platformId,
        ok: false,
        mode,
        message: '未登录，请先在「偏好设置 → 平台授权托管」完成授权',
      };
    }

    let uploadedCount = 0;
    if (cfg.imageBed.strategy === 'custom_oss') {
      const uploader = createImageBedUploader();
      const uploadResult = await uploadLocalImagesForPublish({
        workspacePath: cfg.workspacePath,
        markdown: payload.markdown,
        config: cfg.imageBed,
        includeRemote,
        uploadFn: uploader,
      });
      if (uploadResult.errors.length > 0) {
        return { platformId, ok: false, mode, message: uploadResult.errors.join('；') };
      }
      uploadedCount = uploadResult.uploadedCount;
    }

    return {
      platformId,
      ok: true,
      mode,
      verified: true,
      uploadedImagesCount: uploadedCount,
      message: `授权与防盗链图片转存校验就绪（已转存 ${uploadedCount} 张图，待接入该平台直发接口）`,
    };
  } catch (err) {
    return {
      platformId,
      ok: false,
      mode,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
