import type { PlatformId } from '@vcat/shared';
import { CheckCheck, Globe, Loader2, RefreshCw, SquareMinus } from 'lucide-react';
import { Button, Checkbox, Tooltip, cn } from '../../ui';
import type { AuthStatus } from '../platform-auth';
import { PLATFORM_SPECS, requirementText, type PlatformSpec } from './platformSpecs';
import type { Issue } from './draftModel';

interface PlatformListProps {
  selected: PlatformId[];
  onToggle: (id: PlatformId, on: boolean) => void;
  issuesOf: (id: PlatformId) => Issue[];
  statusOf: (id: PlatformId) => AuthStatus;
  onSignIn: (id: PlatformId) => void;
  /** 在内置浏览器（带跨平台 Tab 的同一个窗口）打开该平台后台；登录状态与列表共用 usePlatformAuth。 */
  onOpenBrowser: (id: PlatformId) => void;
  checking: boolean;
  onRefresh: () => void;
  /** 切换：没全选时勾选所有已登录的平台；已全选时全部取消。 */
  onSelectPushable: () => void;
  /** 已登录的平台是否都已勾上（决定按钮文案）。 */
  allPushableSelected: boolean;
}

/** 登录状态：所有平台都显示（不管勾没勾）。 */
function AuthCell({ spec, status, onSignIn }: { spec: PlatformSpec; status: AuthStatus; onSignIn: () => void }) {
  if (spec.kind === 'site') return <span className="text-[11px] text-muted" data-auth={spec.id}>无需登录</span>;
  if (status === 'checking')
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted" data-auth={spec.id}>
        <Loader2 className="size-3 animate-spin" aria-hidden />
        检测中
      </span>
    );
  if (status === 'signedIn')
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted" data-auth={spec.id}>
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        已登录
      </span>
    );
  return (
    <span className="flex items-center text-[11px]" data-auth={spec.id}>
      <span className={status === 'error' ? 'text-danger' : 'text-muted'}>{status === 'error' ? '检测失败' : '未登录'}</span>
      <Button
        variant="ghost"
        className="h-7 px-1.5 text-[11px] text-primary hover:text-primary"
        onClick={(e) => {
          e.stopPropagation();
          onSignIn();
        }}
      >
        登录
      </Button>
    </span>
  );
}

/** 内容校验：只对已勾选的平台显示，放在名称下方，和登录状态分开。 */
function CheckLine({ issues }: { issues: Issue[] }) {
  const n = issues.filter((i) => i.level === 'error' && i.field !== 'auth').length;
  return n ? <span className="text-[11px] text-warning">差 {n} 项</span> : <span className="text-[11px] text-success">内容就绪</span>;
}

/** 左侧：勾选要发的平台。每行：勾选框、名称（勾选后下方显示内容是否就绪）、登录状态、「内置浏览器」。点整行即可勾选。 */
export function PlatformList(props: PlatformListProps) {
  const accounts = PLATFORM_SPECS.filter((s) => s.kind !== 'site');
  const signedIn = accounts.filter((s) => props.statusOf(s.id) === 'signedIn').length;
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 px-5 pb-2 pt-4">
        <span className="block text-xs font-medium text-ink">平台</span>
        <Button
          variant="secondary"
          className="h-9 w-full text-[13px]"
          onClick={props.onSelectPushable}
          disabled={signedIn === 0}
          data-testid="select-pushable"
        >
          {props.allPushableSelected ? <SquareMinus aria-hidden /> : <CheckCheck aria-hidden />}
          {props.allPushableSelected ? '取消全选' : '全选可推送'}
        </Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {PLATFORM_SPECS.map((spec) => {
          const on = props.selected.includes(spec.id);
          return (
            <li key={spec.id}>
              <div
                data-testid={`platform-row-${spec.id}`}
                onClick={() => props.onToggle(spec.id, !on)}
                className={cn(
                  'flex min-h-11 cursor-default items-center gap-3 rounded-[var(--radius-ui)] px-2.5 py-1',
                  on ? 'bg-hover/70' : 'hover:bg-hover/50'
                )}
              >
                <span className="flex" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={on} onCheckedChange={(v) => props.onToggle(spec.id, v)} aria-label={`发布到${spec.name}`} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <Tooltip content={requirementText(spec)}>
                    <span className={cn('truncate text-[13px]', on ? 'text-ink' : 'text-muted')}>{spec.name}</span>
                  </Tooltip>
                  {on ? <CheckLine issues={props.issuesOf(spec.id)} /> : null}
                </span>
                <AuthCell spec={spec} status={props.statusOf(spec.id)} onSignIn={() => props.onSignIn(spec.id)} />
                {spec.kind !== 'site' ? (
                  <Tooltip content="内置浏览器">
                    <Button
                      variant="ghost"
                      className="size-9 shrink-0 p-0 text-muted hover:text-ink"
                      aria-label={`在内置浏览器打开${spec.name}`}
                      data-testid={`open-browser-${spec.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onOpenBrowser(spec.id);
                      }}
                    >
                      <Globe />
                    </Button>
                  </Tooltip>
                ) : (
                  <span className="w-9 shrink-0" aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-5 py-2 text-xs text-muted">
        <span data-testid="auth-summary">{props.checking ? '正在检测登录…' : `已登录 ${signedIn} / ${accounts.length}`}</span>
        <Button variant="ghost" className="h-9" onClick={props.onRefresh} disabled={props.checking} aria-label="刷新登录状态">
          <RefreshCw className={cn(props.checking && 'animate-spin')} />
          刷新
        </Button>
      </div>
    </div>
  );
}
