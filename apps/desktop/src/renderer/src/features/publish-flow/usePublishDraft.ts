import { useEffect, useMemo, useState } from 'react';
import { extractWeixinDigest } from '@vcat/core/weixin';
import type { ArticleMeta } from '@vcat/shared';
import { createDraft, extractImages, loadDraft, saveDraft, type PublishDraft } from './draftModel';

/** 当前文章的发布设置：首次从正文推断，之后按文章记住。 */
export function usePublishDraft(article: ArticleMeta | null, markdown: string) {
  const key = article?.relativePath ?? '__untitled__';
  const autoDigest = useMemo(() => extractWeixinDigest(markdown), [markdown]);
  const candidates = useMemo(() => extractImages(markdown), [markdown]);
  const [draft, setDraft] = useState<PublishDraft>(() => {
    const base = createDraft(markdown, article?.title ?? '未命名文章', autoDigest);
    const saved = loadDraft(key);
    return saved ? { ...base, ...saved } : { ...base, selected: ['weixin'] };
  });
  useEffect(() => saveDraft(key, draft), [key, draft]);
  const update = (patch: Partial<PublishDraft>) => setDraft((d) => ({ ...d, ...patch }));
  return { draft, update, autoDigest, candidates };
}
