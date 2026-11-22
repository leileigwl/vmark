import type { MultiPlatformPublishPayload, MultiPlatformPublishResultItem, PlatformId } from '@vcat/shared';
import { coverFor, resolveFor, type PublishDraft } from './draftModel.ts';
import { SPEC_BY_ID, type CoverRatio } from './platformSpecs.ts';

export type RunState = 'pending' | 'running' | 'ok' | 'failed';
export interface RunRow {
  id: PlatformId;
  state: RunState;
  message?: string;
  url?: string;
}

/** 按焦点把上传的封面裁成某比例，返回工作区相对路径。 */
export type CoverCropper = (src: string, ratio: CoverRatio, focus: { x: number; y: number }) => Promise<string>;

/**
 * 组装某平台的推送内容。封面：
 * - 上传了封面：按该平台主比例裁一张（同一比例只裁一次）；卡片平台作为第 1 张图插入；
 * - 没上传：公众号/百家号/微博用正文首图，其他平台不带封面，卡片平台用第一张卡片。
 * 裁剪失败时退回原图，由平台自行裁切。
 */
export async function buildPayload(
  draft: PublishDraft,
  markdown: string,
  id: PlatformId,
  bodyImage: string,
  crop: CoverCropper,
  cache: Map<CoverRatio, Promise<string>>
): Promise<MultiPlatformPublishPayload> {
  const spec = SPEC_BY_ID[id];
  const v = resolveFor(draft, id);
  const cover = spec ? coverFor(draft, spec, bodyImage) : null;
  let coverPath: string | undefined;
  if (cover?.kind === 'upload' && spec?.cover) {
    const ratio = spec.cover.ratios[0];
    if (!cache.has(ratio)) cache.set(ratio, crop(cover.src, ratio, draft.coverFocus).catch(() => cover.src));
    coverPath = await cache.get(ratio);
  } else if (cover?.kind === 'body') {
    coverPath = cover.src;
  }
  const isCards = spec?.kind === 'cards';
  return {
    title: v.title,
    markdown,
    digest: v.digest || undefined,
    tags: v.tags.length ? v.tags : undefined,
    coverImageUrl: isCards ? undefined : coverPath,
    socialCoverImagePath: isCards ? coverPath : undefined,
    includeRemoteImages: draft.includeRemoteImages,
    socialThemeId: draft.socialThemeId ?? undefined,
    socialCoverRatio: isCards ? '3:4' : undefined,
    juejinCategoryId: spec?.category && draft.juejinCategoryId ? draft.juejinCategoryId : undefined,
    targets: [{ platformId: id, mode: spec?.mode ?? 'draft' }],
  };
}

/** 逐个平台推送，各平台用自己的标题/摘要/封面。onRow 用于实时刷新进度。 */
export async function runPublish(
  draft: PublishDraft,
  markdown: string,
  targets: PlatformId[],
  onRow: (row: RunRow) => void,
  deps: { bodyImage: string; crop: CoverCropper }
): Promise<void> {
  const api = window.electronAPI;
  const cache = new Map<CoverRatio, Promise<string>>();
  for (const id of targets) {
    onRow({ id, state: 'running' });
    try {
      if (!api?.publishMultiPlatform) throw new Error('当前环境不支持推送');
      const payload = await buildPayload(draft, markdown, id, deps.bodyImage, deps.crop, cache);
      const res = await api.publishMultiPlatform(payload);
      const item: MultiPlatformPublishResultItem | undefined = res.results?.find((r) => r.platformId === id) ?? res.results?.[0];
      if (item?.ok) onRow({ id, state: 'ok', message: item.message, url: item.url });
      else onRow({ id, state: 'failed', message: item?.message ?? '平台没有返回结果' });
    } catch (err) {
      onRow({ id, state: 'failed', message: err instanceof Error ? err.message : String(err) });
    }
  }
}
