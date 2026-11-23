import type { AdapterPushPayload } from '@vcat/adapters';
import type { MultiPlatformPublishPayload } from '@vcat/shared';

/** 掘金草稿的推送内容：图片已转存的正文 + 发布弹窗里填的摘要、标签、分类。 */
export function buildJuejinPush(payload: MultiPlatformPublishPayload, markdown: string): AdapterPushPayload {
  return {
    title: payload.title,
    markdown,
    html: '',
    tags: payload.tags ?? [],
    digest: payload.digest,
    categoryId: payload.juejinCategoryId,
    mode: 'draft',
  };
}
