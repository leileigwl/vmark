import type { PlatformId } from '@vcat/shared';
import { RefreshCw } from 'lucide-react';
import { Button, Checkbox, Tooltip, cn } from '../../ui';
import type { AuthStatus } from '../platform-auth';
import { PLATFORM_SPECS, requirementText } from './platformSpecs';
import type { Issue } from './draftModel';

interface PlatformListProps {
  selected: PlatformId[];
  onToggle: (id: PlatformId, on: boolean) => void;
  issuesOf: (id: PlatformId) => Issue[];
  statusOf: (id: PlatformId) => AuthStatus;
  onSignIn: (id: PlatformId) => void;
  checking: boolean;
  onRefresh: () => void;
}

function RowStatus({ on, status, issues, onSignIn }: { on: boolean; status: AuthStatus; issues: Issue[]; onSignIn: () => void }) {
  if (status === 'checking') return <span className="text-xs text-muted">检测中</span>;
  if (status === 'signedOut' || status === 'error')
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-xs text-muted">未登录</span>
        <Button
          variant="ghost"
          className="h-8 px-2 text-xs text-primary hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onSignIn();
          }}
        >
          登录
        </Button>
      </span>
    );
  if (!on) return null;
  const n = issues.filter((i) => i.level === 'error' && i.field !== 'auth').length;
  return n ? <span className="text-xs text-warning">差 {n} 项</span> : <span className="text-xs text-success">就绪</span>;
}

/** 左侧：勾选要发的平台。每行只有勾选框、名称、状态；点整行即可勾选。 */
export function PlatformList(props: PlatformListProps) {
  return (
    <div className="flex h-full flex-col">
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {PLATFORM_SPECS.map((spec) => {
          const on = props.selected.includes(spec.id);
          const status: AuthStatus = spec.kind === 'site' ? 'signedIn' : props.statusOf(spec.id);
          return (
            <li key={spec.id}>
                <div
                  data-testid={`platform-row-${spec.id}`}
                  onClick={() => props.onToggle(spec.id, !on)}
                  className={cn(
                    'flex min-h-10 cursor-default items-center gap-3 rounded-[var(--radius-ui)] px-3',
                    on ? 'bg-hover/70' : 'hover:bg-hover/50'
                  )}
                >
                  <span className="flex" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={on} onCheckedChange={(v) => props.onToggle(spec.id, v)} aria-label={`发布到${spec.name}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <Tooltip content={requirementText(spec)}>
                      <span className={cn('truncate text-[13px]', on ? 'text-ink' : 'text-muted')}>{spec.name}</span>
                    </Tooltip>
                  </span>
                  <RowStatus on={on} status={status} issues={props.issuesOf(spec.id)} onSignIn={() => props.onSignIn(spec.id)} />
                </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
        <span>{props.checking ? '正在检测登录…' : '登录状态'}</span>
        <Button variant="ghost" className="h-9" onClick={props.onRefresh} disabled={props.checking} aria-label="刷新登录状态">
          <RefreshCw className={cn(props.checking && 'animate-spin')} />
          刷新
        </Button>
      </div>
    </div>
  );
}
