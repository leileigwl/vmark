import { useMemo } from 'react';
import type { PlatformId } from '@vcat/shared';
import { renderXiaohongshuCards } from '@vcat/core';
import { previewSrc } from './coverCrop';
import { coverFor, ownCoverOf, resolveFor, type Issue, type PublishDraft } from './draftModel';
import type { PlatformSpec } from './platformSpecs';
import { CardStrip } from './CardStrip';
import { SectionCard } from './SectionCard';
import { OwnCoverEntries } from './OwnCoverField';

interface SocialSectionProps {
  draft: PublishDraft;
  /** 已勾选的卡片平台（小红书 / 抖音）。 */
  specs: PlatformSpec[];
  markdown: string;
  issuesOf: (id: PlatformId) => Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/**
 * 小红书 + 抖音分区：只选卡片模板、看卡片预览。标题、正文、话题、封面都用通用内容——
 * 标题超长自动截取（在「需要单独处理」里提示），正文自动转纯文本，话题用通用标签，封面（单独设置的优先，否则通用封面）插到卡片最前。
 */
export function SocialSection({ draft, specs, markdown, issuesOf, onChange }: SocialSectionProps) {
  const first = specs[0];
  const v = resolveFor(draft, first.id);
  const maxCards = Math.min(...specs.map((x) => x.maxCards ?? Infinity));
  const cards = useMemo(() => renderXiaohongshuCards(markdown, { fallbackTitle: v.title, coverRatio: '3:4', maxCards, includeCover: false }).totalCards, [markdown, v.title, maxCards]);
  // 第一个卡片平台的封面：单独设置的优先，其次通用封面（各平台的单独封面入口在本块卡片预览下方）。
  const source = coverFor(draft, first, '');
  const cover = source?.kind === 'upload' ? source.src : '';
  const own = !!ownCoverOf(draft, first);

  const issues = specs.flatMap((x) => issuesOf(x.id).filter((i) => i.level === 'error' && i.field !== 'auth').map((i) => `${x.short}${i.message}`));
  const total = cards + (cover ? 1 : 0);
  const summary = issues.length ? issues.join(' · ') : `${total} 张卡片 · 标题「${v.title}」`;

  return (
    <SectionCard id="social" title={specs.map((x) => x.short).join(' · ')} summary={summary} warn={issues.length > 0}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-ink">卡片</div>
            <p className="mt-0.5 text-[11px] text-muted">
              封面 {first.cover?.ratios.join('/')} · 有通用封面就插到卡片最前，没传就第一张卡片做封面
            </p>
          </div>
          {cover ? <img src={previewSrc(cover)} alt={own ? '卡片封面（单独封面）' : '卡片封面（通用封面）'} className="h-12 w-9 shrink-0 rounded border border-line object-cover" /> : null}
        </div>
        <CardStrip
          markdown={markdown}
          title={v.title}
          themeId={draft.socialThemeId ?? (first.id === 'douyin' ? 'minimalist-magazine' : 'ios-memo')}
          onThemeChange={(id) => onChange({ socialThemeId: id })}
          maxCards={Number.isFinite(maxCards) ? maxCards : undefined}
        />
      </div>
      <OwnCoverEntries draft={draft} specs={specs} onChange={onChange} />
    </SectionCard>
  );
}
