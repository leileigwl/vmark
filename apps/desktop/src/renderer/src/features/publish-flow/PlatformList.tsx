import type { PlatformId } from '@vcat/shared';
import { AlertTriangle, CheckCircle2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, Checkbox, cn } from '../../ui';
import type { AuthStatus } from '../platform-auth';
import { KIND_LABEL, PLATFORM_SPECS, type PlatformKind } from './platformSpecs';
import type { Issue } from './draftModel';
import { PlatformIcon } from './PlatformIcon';

interface PlatformListProps {
  active: PlatformId | 'common';
  onActivate: (id: PlatformId | 'common') => void;
  selected: PlatformId[];
  onToggle: (id: PlatformId, on: boolean) => void;
  issuesOf: (id: PlatformId) => Issue[];
  statusOf: (id: PlatformId) => AuthStatus;
  onSignIn: (id: PlatformId) => void;
  checking: boolean;
  onRefresh: () => void;
  lastCheckedAt: number | null;
}

function RowState({ status, issues, onSignIn }: { status: AuthStatus; issues: Issue[]; onSignIn: () => void }) {
  if (status === 'checking') return <Badge>检测中</Badge>;
  if (status === 'signedOut' || status === 'error')
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSignIn();
        }}
        className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary-soft"
      >
        {status === 'error' ? '重试登录' : '去登录'}
      </button>
    );
  const errors = issues.filter((i) => i.level === 'error' && i.field !== 'auth').length;
  if (errors > 0)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warning">
        <AlertTriangle className="size-3.5" />
        {errors} 项待补
      </span>
    );
  return <CheckCircle2 className="size-4 text-success" aria-label="已就绪" />;
}

/** 左侧：通用信息 + 按类型分组的平台列表。勾选=要发，点击=编辑该平台。 */
export function PlatformList(props: PlatformListProps) {
  const groups: PlatformKind[] = ['article', 'cards', 'site'];
  const time = props.lastCheckedAt ? new Date(props.lastCheckedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() => props.onActivate('common')}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-[var(--radius-ui)] px-2.5 py-2 text-left text-[13px] font-medium',
            props.active === 'common' ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-hover'
          )}
        >
          <SlidersHorizontal className="size-4" />
          通用信息
        </button>
        {groups.map((kind) => (
          <div key={kind}>
            <div className="px-2.5 pb-1 text-[11px] font-medium text-muted">{KIND_LABEL[kind]}</div>
            <ul className="space-y-0.5">
              {PLATFORM_SPECS.filter((s) => s.kind === kind).map((spec) => {
                const on = props.selected.includes(spec.id);
                const status = spec.kind === 'site' ? 'signedIn' : props.statusOf(spec.id);
                return (
                  <li key={spec.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      data-testid={`platform-row-${spec.id}`}
                      onClick={() => props.onActivate(spec.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') props.onActivate(spec.id);
                      }}
                      className={cn(
                        'flex cursor-default items-center gap-2.5 rounded-[var(--radius-ui)] px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                        props.active === spec.id ? 'bg-hover' : 'hover:bg-hover/60'
                      )}
                    >
                      <span onClick={(e) => e.stopPropagation()} className="flex">
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) => props.onToggle(spec.id, v)}
                          aria-label={`发布到${spec.name}`}
                        />
                      </span>
                      <PlatformIcon id={spec.id} size="sm" />
                      <span className={cn('min-w-0 flex-1 truncate text-[13px]', on ? 'text-ink' : 'text-muted')}>{spec.name}</span>
                      {on ? (
                        <RowState status={status} issues={props.issuesOf(spec.id)} onSignIn={() => props.onSignIn(spec.id)} />
                      ) : status === 'signedOut' ? (
                        <span className="text-[11px] text-muted/70">未登录</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-muted">
        <span>{props.checking ? '正在检测登录状态…' : time ? `登录状态 ${time} 更新` : '尚未检测'}</span>
        <Button variant="ghost" size="sm" onClick={props.onRefresh} disabled={props.checking} aria-label="刷新登录状态">
          <RefreshCw className={cn(props.checking && 'animate-spin')} />
          刷新
        </Button>
      </div>
    </div>
  );
}
