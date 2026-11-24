import { useEffect, useMemo, useState } from 'react';
import { extractWeixinDigest } from '@vcat/core/weixin';
import type { ArticleMeta } from '@vcat/shared';
import { createDraft, firstBodyImage, loadDraft, mergeSaved, saveDraft, type PublishDraft } from './draftModel';

/** 当前文章的发布设置：首次从正文推断，之后按文章记住。 */
export function usePublishDraft(article: ArticleMeta | null, markdown: string) {
  const key = article?.relativePath ?? '__untitled__';
  const bodyImage = useMemo(() => firstBodyImage(markdown), [markdown]);
  const [draft, setDraft] = useState<PublishDraft>(() =>
    mergeSaved(createDraft(markdown, article?.title ?? '未命名文章', extractWeixinDigest(markdown)), loadDraft(key))
  );
  useEffect(() => saveDraft(key, draft), [key, draft]);
  const update = (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) =>
    setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  return { draft, update, bodyImage };
}
