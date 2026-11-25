import { useEffect, useRef, useState } from 'react';
import type { PlatformId } from '@vcat/shared';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { Field, Input, Textarea, Tooltip, cn } from '../../ui';
import { resolveFor, setOverride, type Issue, type PublishDraft } from './draftModel';
import { requirementText, type PlatformSpec } from './platformSpecs';
import { TagPicker } from './TagPicker';
import { CategoryPicker } from './CategoryPicker';
import { useJuejinCategories } from './useJuejinCategories';

interface AttentionListProps {
  draft: PublishDraft;
  specs: PlatformSpec[];
  issuesOf: (id: PlatformId) => Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/**
 * 过滤进入「需要单独处理」的问题：
 * 通用内容未填（缺标题/缺摘要/缺标签）和 16:9 封面统一在上方填写/上传，不在这里重复弹出；
 * 只保留平台差异项（字数超限或不足、标签超上限、掘金缺分类，或该平台已单独改写过）。
 */
function attentionIssues(draft: PublishDraft, spec: PlatformSpec, rawIssues: Issue[]): Issue[] {
  const o = draft.overrides[spec.id] ?? {};
  const missingTitle = !draft.title.trim() && o.title === undefined;
  const missingDigest = !draft.digest.trim() && o.digest === undefined;
  const missingTags = draft.tags.length === 0 && o.tags === undefined;
  return rawIssues.filter((i) => {
    if (i.field === 'auth' || i.field === 'cover') return false;
    if (i.field === 'title' && missingTitle) return false;
    if (i.field === 'digest' && missingDigest) return false;
    if (i.field === 'tags' && missingTags) return false;
    return true;
  });
}

interface RowProps extends Omit<AttentionListProps, 'specs' | 'issuesOf'> {
  spec: PlatformSpec;
  issues: Issue[];
  open: boolean;
  setOpen: (open: boolean) => void;
  juejinCategories: readonly { id: string; name: string }[];
}

function AttentionRow({ spec, draft, issues, open, setOpen, onChange, juejinCategories }: RowProps) {
  const v = resolveFor(draft, spec.id);
  const o = draft.overrides[spec.id] ?? {};
  const has = (f: Issue['field']) => issues.some((i) => i.field === f);
  // 展开期间出现过问题的字段一直显示，改好后不会在手下消失；收起时清空。
  const [seen, setSeen] = useState<Issue['field'][]>([]);
  const fresh = open ? issues.map((i) => i.field).filter((f) => !seen.includes(f)) : [];
  if (fresh.length) setSeen([...seen, ...fresh]);
  if (!open && seen.length) setSeen([]);
  const show = (f: Issue['field']) => has(f) || seen.includes(f);
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
          ) : null}
          {spec.category && show('category') ? (
            <CategoryPicker label={`${spec.short}分类`} options={juejinCategories} value={draft.juejinCategoryId} onChange={(id) => onChange({ juejinCategoryId: id })} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * 只列出需要单独处理的平台（标题/摘要超限或不足、标签超上限、掘金缺分类），一行一个。
 * 通用内容未填或缺 16:9 封面时，直接在上方「通用内容」填写，不在此重复弹出。
 */
export function AttentionList({ draft, specs, issuesOf, onChange }: AttentionListProps) {
  const juejin = useJuejinCategories(specs.some((s) => s.id === 'juejin'));
  const juejinCategories = juejin.options;
  // 草稿里存的分类 id 可能来自旧的分类列表：列表加载结束后不在其中就清空，
  // 让「缺分类」照常提示，而不是把失效 id 静默提交给掘金。
  const staleJuejinId =
    juejin.settled && draft.juejinCategoryId !== '' && !juejinCategories.some((c) => c.id === draft.juejinCategoryId);
  useEffect(() => {
    if (staleJuejinId) onChange({ juejinCategoryId: '' });
  }, [staleJuejinId]);
  const [open, setOpenSet] = useState<Set<PlatformId>>(new Set());
  const setOpen = (id: PlatformId, on: boolean) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const rows = specs
    .map((spec) => ({ spec, issues: attentionIssues(draft, spec, issuesOf(spec.id)) }))
    .filter(({ issues, spec }) => issues.length || open.has(spec.id));

  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted">需要单独处理</h3>
      <ul className="space-y-2" data-testid="attention-list">
        {rows.map(({ spec, issues }) => (
          <AttentionRow
            key={spec.id}
            spec={spec}
            draft={draft}
            issues={issues}
            open={open.has(spec.id)}
            setOpen={(on) => setOpen(spec.id, on)}
            juejinCategories={juejinCategories}
            onChange={onChange}
          />
        ))}
      </ul>
    </section>
  );
}
