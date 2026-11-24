import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PlatformId } from '@vcat/shared';
import { CheckCircle2, ChevronDown, ImagePlus } from 'lucide-react';
import { Button, Field, Input, Textarea, Tooltip, cn } from '../../ui';
import { coverFor, resolveFor, setOverride, type Issue, type PublishDraft } from './draftModel';
import { requirementText, rowCoverHint, type PlatformSpec } from './platformSpecs';
import { TagInput } from './TagInput';
import { TagPicker } from './TagPicker';
import { CategoryPicker } from './CategoryPicker';
import { useJuejinCategories } from './useJuejinCategories';

interface AttentionListProps {
  draft: PublishDraft;
  specs: PlatformSpec[];
  issuesOf: (id: PlatformId) => Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
  coverInputRef: RefObject<HTMLInputElement>;
  /** 正文首图，用来说明必需封面的平台会用哪张图裁。 */
  bodyImage: string;
}

/** 行里列出的问题：会挡推送的 error，以及只提示不挡的 warn（如摘要超长会自动截取）。 */
const fieldIssues = (issues: Issue[]) => issues.filter((i) => i.field !== 'auth');

interface RowProps extends Omit<AttentionListProps, 'specs' | 'issuesOf'> {
  spec: PlatformSpec;
  issues: Issue[];
  open: boolean;
  setOpen: (open: boolean) => void;
  juejinCategories: readonly { id: string; name: string }[];
}

function AttentionRow({ spec, draft, issues, open, setOpen, onChange, coverInputRef, bodyImage, juejinCategories }: RowProps) {
  const v = resolveFor(draft, spec.id);
  const o = draft.overrides[spec.id] ?? {};
  const has = (f: Issue['field']) => issues.some((i) => i.field === f);
  // 展开期间出现过问题的字段一直显示，改好后不会在手下消失；收起时清空。
  const [seen, setSeen] = useState<Issue['field'][]>([]);
  const fresh = open ? issues.map((i) => i.field).filter((f) => !seen.includes(f)) : [];
  if (fresh.length) setSeen([...seen, ...fresh]);
  if (!open && seen.length) setSeen([]);
  const show = (f: Issue['field']) => has(f) || seen.includes(f);
  const coverHint = rowCoverHint(spec, coverFor(draft, spec, bodyImage));
  const override = (patch: Parameters<typeof setOverride>[2]) => onChange((d) => ({ overrides: setOverride(d, spec.id, patch) }));
  // 标签默认全部平台共用；只有平台有个数上限且通用标签超出（或已单独挑过）时，才在行里挑该平台用哪几个。
  const pickTags = !!spec.tags && (o.tags !== undefined || draft.tags.length > spec.tags.max);

  const summary = issues.map((i) => i.message);

  // 改好后点到别处（或用键盘把焦点移出）就收起。用 click 而不是失焦，避免按下鼠标时行消失导致点空。
  const liRef = useRef<HTMLLIElement>(null);
  const closeRef = useRef(() => setOpen(false));
  closeRef.current = () => setOpen(false);
  const done = open && !issues.some((i) => i.level === 'error');
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
          {issues.length ? summary.join(' · ') : '已就绪'}
        </span>
        {!issues.some((i) => i.level === 'error') ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : null}
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
            <Field
              label={`${spec.short}摘要`}
              htmlFor={`d-${spec.id}`}
              count={{ value: [...v.digest.trim()].length, max: spec.digest.max, min: spec.digest.min }}
              hint={o.digest === undefined && v.digest !== draft.digest ? `已自动截取到 ${spec.digest.max} 字，可在这里改写` : undefined}
            >
              <Textarea id={`d-${spec.id}`} value={v.digest} onChange={(e) => override({ digest: e.target.value })} aria-invalid={issues.some((i) => i.field === 'digest' && i.level === 'error')} />
            </Field>
          ) : null}
          {spec.tags && pickTags ? (
            <TagPicker
              label={`${spec.short}标签`}
              options={[...new Set([...draft.tags, ...(o.tags ?? [])])]}
              value={v.tags}
              max={spec.tags.max}
              hint={[`最多 ${spec.tags.max} 个，默认取通用标签前 ${spec.tags.max} 个`, spec.tags.hint].filter(Boolean).join('；')}
              onChange={(tags) => override({ tags })}
            />
          ) : spec.tags && show('tags') ? (
            <Field label="标签（所有平台共用）" htmlFor={`g-${spec.id}`}>
              <TagInput id={`g-${spec.id}`} value={draft.tags} onChange={(tags) => onChange({ tags })} placeholder="回车添加" />
            </Field>
          ) : null}
          {spec.category && show('category') ? (
            <CategoryPicker label={`${spec.short}分类`} options={juejinCategories} value={draft.juejinCategoryId} onChange={(id) => onChange({ juejinCategoryId: id })} />
          ) : null}
          {coverHint ? (
            <div className="flex min-h-9 items-center justify-between gap-4">
              <span className="text-xs text-muted" data-testid={`cover-rule-${spec.id}`}>
                {coverHint}
              </span>
              {show('cover') && !draft.coverUpload ? (
                <Button className="h-9" onClick={() => coverInputRef.current?.click()}>
                  <ImagePlus />
                  上传封面
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * 只列出需要单独处理的平台，一行一个（如“掘金：摘要差 12 字”）。
 * 点开就地修改，改好后焦点离开即收起；没问题的平台不出现。公众号封面的问题在公众号块里看。
 * 小红书/抖音也在这里：通用标题超长时提示「标题超 N 字（自动截取）」，可点开单独改写。
 */
export function AttentionList({ specs, issuesOf, ...rest }: AttentionListProps) {
  const juejinCategories = useJuejinCategories(specs.some((s) => s.id === 'juejin'));
  const [open, setOpenSet] = useState<Set<PlatformId>>(new Set());
  const setOpen = (id: PlatformId, on: boolean) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  // 公众号的封面问题在公众号块里处理，标题/摘要/标签问题和其他平台一样在这里改。
  const rows = specs
    .map((spec) => ({ spec, issues: fieldIssues(issuesOf(spec.id)).filter((i) => spec.id !== 'weixin' || i.field !== 'cover') }))
    .filter(({ issues, spec }) => issues.length || open.has(spec.id));

  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted">需要单独处理</h3>
      <ul className="space-y-2" data-testid="attention-list">
        {rows.map(({ spec, issues }) => (
          <AttentionRow key={spec.id} spec={spec} issues={issues} open={open.has(spec.id)} setOpen={(on) => setOpen(spec.id, on)} juejinCategories={juejinCategories} {...rest} />
        ))}
      </ul>
    </section>
  );
}
