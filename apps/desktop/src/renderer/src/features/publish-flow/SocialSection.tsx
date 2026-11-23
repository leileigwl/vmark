import { useMemo, useRef } from 'react';
import type { PlatformId } from '@vcat/shared';
import { renderXiaohongshuCards } from '@vcat/core';
import { ImagePlus } from 'lucide-react';
import { Button, Field, Input, Textarea } from '../../ui';
import { previewSrc } from './coverCrop';
import { useImageUpload } from './CoverField';
import { resolveFor, type Issue, type PublishDraft, type SocialDraft } from './draftModel';
import type { PlatformSpec } from './platformSpecs';
import { CardStrip } from './CardStrip';
import { TagInput } from './TagInput';
import { SectionCard } from './SectionCard';

interface SocialSectionProps {
  draft: PublishDraft;
  /** 已勾选的卡片平台（小红书 / 抖音）。 */
  specs: PlatformSpec[];
  markdown: string;
  issuesOf: (id: PlatformId) => Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/** 小红书 + 抖音单独一个分区：卡片缩略图、第一张卡即封面（可上传插到最前）、自己的标题 / 纯文本正文 / 话题。 */
export function SocialSection({ draft, specs, markdown, issuesOf, onChange }: SocialSectionProps) {
  const first = specs[0];
  const v = resolveFor(draft, first.id);
  const s = draft.social;
  const set = (patch: Partial<SocialDraft>) => onChange((d) => ({ social: { ...d.social, ...patch } }));
  const titleMax = Math.min(...specs.map((x) => x.title.max));
  const maxCards = Math.min(...specs.map((x) => x.maxCards ?? Infinity));
  const cards = useMemo(() => renderXiaohongshuCards(markdown, { fallbackTitle: v.title, coverRatio: '3:4', maxCards }).totalCards, [markdown, v.title, maxCards]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, error, busy } = useImageUpload((cover) => set({ cover }), fileRef);

  const issues = specs.flatMap((x) => issuesOf(x.id).filter((i) => i.level === 'error' && i.field !== 'auth').map((i) => `${x.short}${i.message}`));
  const total = cards + (s.cover ? 1 : 0);
  const summary = issues.length ? issues.join(' · ') : `${total} 张卡片 · 标题「${v.title}」`;

  return (
    <SectionCard id="social" title={specs.map((x) => x.short).join(' · ')} summary={summary} warn={issues.length > 0}>
      <Field label="标题" htmlFor="social-title" count={{ value: [...v.title.trim()].length, max: titleMax }} hint={s.title ? undefined : `默认取通用标题前 ${titleMax} 字`}>
        <Input id="social-title" className="h-9" value={s.title ?? ''} placeholder={v.title} onChange={(e) => set({ title: e.target.value || undefined })} />
      </Field>
      <Field label="正文（纯文本）" htmlFor="social-body">
        <Textarea id="social-body" value={s.body ?? ''} placeholder="留空则自动把文章转成纯文本" onChange={(e) => set({ body: e.target.value || undefined })} />
      </Field>
      <Field label="话题" htmlFor="social-topics" hint={s.topics ? undefined : '默认沿用通用标签'}>
        <TagInput id="social-topics" value={s.topics ?? draft.tags} onChange={(topics) => set({ topics })} placeholder="回车添加" />
      </Field>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-ink">卡片</div>
            <p className="mt-0.5 text-[11px] text-muted">封面 {first.cover?.ratios.join('/')} · {s.cover ? '上传的封面是第 1 张，后面接正文卡片' : '第一张卡片就是封面；可上传一张图插到最前'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {s.cover ? (
              <>
                <img src={previewSrc(s.cover)} alt="卡片封面" className="h-12 w-9 rounded border border-line object-cover" />
                <Button variant="ghost" className="h-9" onClick={() => set({ cover: '' })}>
                  移除
                </Button>
              </>
            ) : (
              <Button className="h-9" loading={busy} onClick={() => fileRef.current?.click()}>
                {!busy ? <ImagePlus /> : null}
                上传封面
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="social-cover-input" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <CardStrip
          markdown={markdown}
          title={v.title}
          themeId={draft.socialThemeId ?? (first.id === 'douyin' ? 'minimalist-magazine' : 'ios-memo')}
          onThemeChange={(id) => onChange({ socialThemeId: id })}
          maxCards={Number.isFinite(maxCards) ? maxCards : undefined}
        />
      </div>
    </SectionCard>
  );
}
