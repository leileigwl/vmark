import type { MultiPlatformPublishResultItem, PlatformId, SocialCoverRatio } from '@vcat/shared';
import { resolveFor, type PublishDraft } from './draftModel';
import { SPEC_BY_ID } from './platformSpecs';

export type RunState = 'pending' | 'running' | 'ok' | 'failed';
export interface RunRow {
  id: PlatformId;
  state: RunState;
  message?: string;
  url?: string;
}

/** 逐个平台推送，各平台用自己的标题/摘要/封面。onRow 用于实时刷新进度。 */
export async function runPublish(
  draft: PublishDraft,
  markdown: string,
  targets: PlatformId[],
  onRow: (row: RunRow) => void
): Promise<void> {
  const api = window.electronAPI;
  for (const id of targets) {
    onRow({ id, state: 'running' });
    const spec = SPEC_BY_ID[id];
    const v = resolveFor(draft, id);
    try {
      if (!api?.publishMultiPlatform) throw new Error('当前环境不支持推送');
      const res = await api.publishMultiPlatform({
        title: v.title,
        markdown,
        digest: v.digest || undefined,
        tags: v.tags.length ? v.tags : undefined,
        coverImageUrl: v.cover || undefined,
        includeRemoteImages: draft.includeRemoteImages,
        socialThemeId: draft.socialThemeId ?? undefined,
        socialCoverRatio: (spec?.kind === 'cards' ? '3:4' : undefined) as SocialCoverRatio | undefined,
        targets: [{ platformId: id, mode: spec?.mode ?? 'draft' }],
      });
      const item: MultiPlatformPublishResultItem | undefined = res.results?.find((r) => r.platformId === id) ?? res.results?.[0];
      if (item?.ok) onRow({ id, state: 'ok', message: item.message, url: item.url });
      else onRow({ id, state: 'failed', message: item?.message ?? '平台没有返回结果' });
    } catch (err) {
      onRow({ id, state: 'failed', message: err instanceof Error ? err.message : String(err) });
    }
  }
}
