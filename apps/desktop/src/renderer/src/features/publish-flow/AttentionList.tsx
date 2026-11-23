import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PlatformId } from '@vcat/shared';
import { renderXiaohongshuCards } from '@vcat/core';
import { JUEJIN_CATEGORIES } from '@vcat/adapters';
import { CheckCircle2, ChevronDown, ImagePlus } from 'lucide-react';
import { Button, Field, Input, Textarea, Tooltip, cn } from '../../ui';
import { resolveFor, setOverride, type Issue, type PublishDraft } from './draftModel';
import { requirementText, type PlatformSpec } from './platformSpecs';
import { TagInput } from './TagInput';
import { CardStrip } from './CardStrip';
import { CategoryPicker } from './CategoryPicker';
import { WeixinPreview } from './WeixinPreview';

interface AttentionListProps {
  draft: PublishDraft;
  specs: PlatformSpec[];
  markdown: string;
  issuesOf: (id: PlatformId) => Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
  coverInputRef: RefObject<HTMLInputElement>;
}

const fieldIssues = (issues: Issue[]) => issues.filter((i) => i.level === 'error' && i.field !== 'auth');

interface RowProps extends Omit<AttentionListProps, 'specs' | 'issuesOf'> {
  spec: PlatformSpec;
  issues: Issue[];
  open: boolean;
  setOpen: (open: boolean) => void;
}

function AttentionRow({ spec, draft, markdown, issues, open, setOpen, onChange, coverInputRef }: RowProps) {
  const v = resolveFor(draft, spec.id);
  const o = draft.overrides[spec.id] ?? {};
  const has = (f: Issue['field']) => issues.some((i) => i.field === f);
  // 展开期间出现过问题的字段一直显示，改好后不会在手下消失；收起时清空。
  const [seen, setSeen] = useState<Issue['field'][]>([]);
  const fresh = open ? issues.map((i) => i.field).filter((f) => !seen.includes(f)) : [];
  if (fresh.length) setSeen([...seen, ...fresh]);
  if (!open && seen.length) setSeen([]);
  const show = (f: Issue['field']) => has(f) || seen.includes(f);
  const errorOf = (f: Issue['field']) => issues.find((i) => i.field === f)?.message ?? null;
  const cards = useMemo(
    () =>
      spec.kind === 'cards' ? renderXiaohongshuCards(markdown, { fallbackTitle: v.title, coverRatio: '3:4', maxCards: spec.maxCards }).totalCards : 0,
    [spec.kind, spec.maxCards, markdown, v.title]
  );
  const total = cards + (draft.coverUpload ? 1 : 0);
  const over = spec.maxCards && total > spec.maxCards ? total - spec.maxCards : 0;
  const override = (patch: Parameters<typeof setOverride>[2]) => onChange((d) => ({ overrides: setOverride(d, spec.id, patch) }));
  const tagsShared = errorOf('tags') === '缺标签' || !o.tags;

  const summary = [
    ...issues.map((i) => i.message),
    ...(spec.kind === 'cards' ? [over ? `卡片超 ${over} 张，多出的不上传` : `${total} 张卡片`] : []),
  ];

  // 改好后点到别处（或用键盘把焦点移出）就收起。用 click 而不是失焦，避免按下鼠标时行消失导致点空。
  const liRef = useRef<HTMLLIElement>(null);
  const closeRef = useRef(() => setOpen(false));
  closeRef.current = () => setOpen(false);
  const done = open && issues.length === 0 && spec.kind !== 'cards';
  useEffect(() => {
    if (!done) return;
    let pointer = false;
    const outside = (t: EventTarget | null) => !(t instanceof Node && liRef.current?.contains(t));
    const onDown = () => {
      pointer = true;
    };
    const onClick = (e: MouseEvent) => {
      pointer = false;
      if (outside(e.target)) closeRef.current();
    };
    const onFocus = (e: FocusEvent) => {
      if (!pointer && outside(e.target)) closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('focusin', onFocus);
    };
  }, [done]);

  return (
    <li ref={liRef} className="rounded-[var(--radius-card)] border border-line" data-testid={`attention-${spec.id}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-card)] px-4 text-left text-[13px] hover:bg-hover/50"
      >
        <Tooltip content={requirementText(spec)}>
          <span className="font-medium text-ink">{spec.short}：</span>
        </Tooltip>
        <span className={cn('min-w-0 flex-1 truncate', issues.length ? 'text-warning' : 'text-muted')}>
          {issues.length || spec.kind === 'cards' ? summary.join(' · ') : spec.id === 'weixin' ? '已就绪 · 点开看排版' : '已就绪'}
        </span>
        {!issues.length && spec.kind !== 'cards' ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : null}
        <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-4 px-4 pb-4 pt-1">
          {show('title') || o.title !== undefined ? (
            <Field label={`${spec.short}标题`} htmlFor={`t-${spec.id}`} count={{ value: [...v.title.trim()].length, max: spec.title.max, min: spec.title.min }}>
              <Input id={`t-${spec.id}`} className="h-9" value={v.title} onChange={(e) => override({ title: e.target.value })} aria-invalid={has('title')} />
            </Field>
          ) : null}
          {spec.digest && (show('digest') || o.digest !== undefined) ? (
            <Field label={`${spec.short}摘要`} htmlFor={`d-${spec.id}`} count={{ value: [...v.digest.trim()].length, max: spec.digest.max, min: spec.digest.min }}>
              <Textarea id={`d-${spec.id}`} value={v.digest} onChange={(e) => override({ digest: e.target.value })} aria-invalid={has('digest')} />
            </Field>
          ) : null}
          {spec.tags && show('tags') ? (
            <Field label={tagsShared ? '标签（所有平台共用）' : `${spec.short}标签`} htmlFor={`g-${spec.id}`}>
              <TagInput
                id={`g-${spec.id}`}
                value={tagsShared ? draft.tags : v.tags}
                onChange={(tags) => (tagsShared ? onChange({ tags }) : override({ tags }))}
                placeholder="回车添加"
              />
            </Field>
          ) : null}
          {spec.category && show('category') ? (
            <CategoryPicker label={`${spec.short}分类`} options={JUEJIN_CATEGORIES} value={draft.juejinCategoryId} onChange={(id) => onChange({ juejinCategoryId: id })} />
          ) : null}
          {show('cover') && !draft.coverUpload ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted">正文里没有图片，{spec.short}需要一张封面。</span>
              <Button className="h-9" onClick={() => coverInputRef.current?.click()}>
                <ImagePlus />
                上传封面
              </Button>
            </div>
          ) : null}
          {spec.id === 'weixin' ? <WeixinPreview markdown={markdown} /> : null}
          {spec.kind === 'cards' ? (
            <div className="space-y-2">
              {draft.coverUpload ? <p className="text-xs text-muted">上传的封面会作为第 1 张图。</p> : null}
              <CardStrip
                markdown={markdown}
                title={v.title}
                themeId={draft.socialThemeId ?? (spec.id === 'douyin' ? 'minimalist-magazine' : 'ios-memo')}
                onThemeChange={(id) => onChange({ socialThemeId: id })}
                maxCards={spec.maxCards}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * 只列出需要单独处理的平台，一行一个（如“掘金：摘要差 12 字”）。
 * 点开就地修改，改好后焦点离开即收起；没问题的平台不出现。卡片平台、公众号常驻一行，缩略图 / 排版预览默认收起。
 */
export function AttentionList({ specs, issuesOf, ...rest }: AttentionListProps) {
  const [open, setOpenSet] = useState<Set<PlatformId>>(new Set());
  const setOpen = (id: PlatformId, on: boolean) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const rows = specs
    .map((spec) => ({ spec, issues: fieldIssues(issuesOf(spec.id)) }))
    // 卡片平台与公众号常驻一行（默认收起），点开看卡片缩略图 / 公众号排版。
    .filter(({ spec, issues }) => issues.length || spec.kind === 'cards' || spec.id === 'weixin' || open.has(spec.id));

  if (specs.length === 0) return <p className="text-xs text-muted">在左侧勾选要发布的平台。</p>;
  if (rows.length === 0)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted" data-testid="attention-empty">
        <CheckCircle2 className="size-4 text-success" />
        已选平台都不需要单独处理。
      </p>
    );
  return (
    <ul className="space-y-2" data-testid="attention-list">
      {rows.map(({ spec, issues }) => (
        <AttentionRow key={spec.id} spec={spec} issues={issues} open={open.has(spec.id)} setOpen={(on) => setOpen(spec.id, on)} {...rest} />
      ))}
    </ul>
  );
}
