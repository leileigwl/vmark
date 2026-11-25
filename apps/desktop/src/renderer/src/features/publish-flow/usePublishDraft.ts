import { useEffect, useState } from 'react';
import type { ArticleMeta } from '@vcat/shared';
import { createEmptyDraft, loadDraft, mergeSaved, saveDraft, type PublishDraft } from './draftModel';

/** 当前文章的发布设置：不从 Frontmatter 或正文自动推断，默认全空由用户手动填写并按文章记住。 */
export function usePublishDraft(article: ArticleMeta | null, _markdown: string) {
  const key = article?.relativePath ?? '__untitled__';
  const bodyImage = '';
  const [draft, setDraft] = useState<PublishDraft>(() => mergeSaved(createEmptyDraft(), loadDraft(key)));
  useEffect(() => saveDraft(key, draft), [key, draft]);
  const update = (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) =>
    setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  return { draft, update, bodyImage };
}
