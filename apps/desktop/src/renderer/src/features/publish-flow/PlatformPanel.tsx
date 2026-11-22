import type { PlatformId } from '@vcat/shared';
import { AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { Badge, Button, Field, Input, MoreMenu, Textarea, type MenuItemDef } from '../../ui';
import { AuthStatusBadge, type AuthStatus } from '../platform-auth';
import { resolveFor, type Issue, type PublishDraft } from './draftModel';
import { previewSrc } from './coverCrop';
import { RATIO_VALUE, type PlatformSpec } from './platformSpecs';
import { PlatformIcon } from './PlatformIcon';
import { TagInput } from './TagInput';
import { CardStrip } from './CardStrip';

interface PlatformPanelProps {
  spec: PlatformSpec;
  draft: PublishDraft;
  markdown: string;
  status: AuthStatus;
  issues: Issue[];
  onChange: (patch: Partial<PublishDraft>) => void;
  onSignIn: () => void;
  onOpenDashboard: () => void;
  onSignOut: () => void;
  onEditCommon: () => void;
  extraMenu?: MenuItemDef[];
}

function requirementText(spec: PlatformSpec): string[] {
  const r = [`标题 ${spec.title.min ? `${spec.title.min}–` : '≤'}${spec.title.max} 字`];
  if (spec.digest) r.push(`摘要${spec.digest.required ? '必填 ' : ' '}${spec.digest.min ? `${spec.digest.min}–` : '≤'}${spec.digest.max} 字`);
  if (spec.cover) r.push(`封面 ${spec.cover.ratio}${spec.cover.required ? ' 必填' : ''}`);
  if (spec.tags?.required) r.push('标签必填');
  return r;
}

/** 单个平台：该平台的要求、可单独改写的字段、封面效果和问题清单。 */
export function PlatformPanel(p: PlatformPanelProps) {
  const { spec, draft } = p;
  const v = resolveFor(draft, spec.id);
  const o = draft.overrides[spec.id] ?? {};
  const setOverride = (patch: { title?: string; digest?: string; tags?: string[] } | null) => {
    const next = { ...draft.overrides };
    if (patch === null) delete next[spec.id];
    else next[spec.id] = { ...o, ...patch };
    p.onChange({ overrides: next });
  };
  const custom = Object.keys(o).length > 0;
  const errorOf = (f: Issue['field']) => p.issues.find((i) => i.field === f && i.level === 'error')?.message ?? null;

  const menu: MenuItemDef[] = [
    ...(p.status === 'signedIn' && spec.kind !== 'site' ? [{ label: '打开平台后台', onSelect: p.onOpenDashboard, icon: <ExternalLink /> }] : []),
    ...(p.extraMenu ?? []),
    ...(p.status === 'signedIn' && spec.kind !== 'site' ? [{ label: '退出登录', onSelect: p.onSignOut, danger: true }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PlatformIcon id={spec.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{spec.name}</h3>
            {spec.kind !== 'site' ? <AuthStatusBadge status={p.status} /> : null}
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            {spec.mode === 'draft' ? '推入草稿箱，到平台后台确认后再发出' : '推送后直接上线'}
            {spec.note ? ` · ${spec.note}` : ''}
          </p>
        </div>
        {p.status !== 'signedIn' && spec.kind !== 'site' ? (
          <Button size="sm" variant="primary" onClick={p.onSignIn}>
            登录{spec.name}
          </Button>
        ) : null}
        {menu.length ? <MoreMenu items={menu} /> : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {requirementText(spec).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {!spec.verified ? <Badge tone="warning">规则待核实</Badge> : null}
      </div>

      {p.issues.filter((i) => i.field === 'cover' || i.field === 'auth').length ? (
        <ul className="space-y-1 rounded-[var(--radius-ui)] border border-line bg-surface p-3">
          {p.issues.filter((i) => i.field === 'cover' || i.field === 'auth').map((i) => (
            <li key={i.message} className={i.level === 'error' ? 'flex items-center gap-1.5 text-xs text-danger' : 'flex items-center gap-1.5 text-xs text-warning'}>
              {i.level === 'error' ? <AlertCircle className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] text-muted">{custom ? '该平台使用单独改写的内容。' : '默认使用通用信息，直接修改即为该平台单独改写。'}</span>
          {custom ? (
            <Button variant="link" size="sm" onClick={() => setOverride(null)}>
              恢复通用信息
            </Button>
          ) : null}
        </div>
        <Field label="标题" htmlFor={`t-${spec.id}`} count={{ value: [...v.title].length, max: spec.title.max, min: spec.title.min }} error={errorOf('title')}>
          <Input id={`t-${spec.id}`} value={v.title} onChange={(e) => setOverride({ title: e.target.value })} aria-invalid={Boolean(errorOf('title'))} />
        </Field>
        {spec.digest ? (
          <Field label={spec.kind === 'cards' ? '正文文案' : '摘要'} htmlFor={`d-${spec.id}`} count={{ value: [...v.digest].length, max: spec.digest.max, min: spec.digest.min }} error={errorOf('digest')}>
            <Textarea id={`d-${spec.id}`} value={v.digest} onChange={(e) => setOverride({ digest: e.target.value })} aria-invalid={Boolean(errorOf('digest'))} />
          </Field>
        ) : null}
        {spec.tags ? (
          <Field label="标签" error={errorOf('tags')} hint={`最多 ${spec.tags.max} 个`}>
            <TagInput value={v.tags} onChange={(tags) => setOverride({ tags })} placeholder="回车添加" />
          </Field>
        ) : null}
      </section>

      {spec.cover ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[13px] font-medium text-ink">封面 {spec.cover.ratio}</h4>
            <Button variant="link" size="sm" onClick={p.onEditCommon}>
              更换或调整
            </Button>
          </div>
          <div
            className="flex items-center justify-center overflow-hidden rounded-md border border-line bg-hover text-[11px] text-muted"
            style={{ aspectRatio: String(RATIO_VALUE[spec.cover.ratio]), width: RATIO_VALUE[spec.cover.ratio] >= 1 ? 360 : 180 }}
          >
            {v.cover ? <img src={previewSrc(v.cover)} alt="" className="size-full object-cover" /> : '还没有封面'}
          </div>
        </section>
      ) : null}

      {spec.kind === 'cards' ? (
        <section className="space-y-2">
          <h4 className="text-[13px] font-medium text-ink">卡片</h4>
          <CardStrip
            markdown={p.markdown}
            title={v.title}
            themeId={draft.socialThemeId ?? (spec.id === 'douyin' ? 'minimalist-magazine' : 'ios-memo')}
            onThemeChange={(id) => p.onChange({ socialThemeId: id })}
            maxCards={spec.maxCards}
          />
        </section>
      ) : null}
    </div>
  );
}
