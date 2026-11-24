import { ExternalLink, LogIn, RefreshCw } from 'lucide-react';
import type { PlatformId } from '@vcat/shared';
import { Button, MoreMenu, cn } from '../../ui';
import { AuthStatusBadge } from './AuthStatusBadge';
import { PLATFORM_LINKS } from './platformLinks';
import type { AuthStatus } from './store';

export interface AccountRow {
  id: PlatformId;
  name: string;
}

interface AccountsPanelProps {
  platforms: AccountRow[];
  status: (id: PlatformId) => AuthStatus;
  checking: boolean;
  lastCheckedAt: number | null;
  error: string | null;
  onRefresh: () => void;
  onSignIn: (id: PlatformId) => void;
  onOpenDashboard: (id: PlatformId) => void;
  onSignOut: (id: PlatformId) => void;
}

/** 设置 → 平台账号：管理登录的唯一地方。每行一个主操作，退出登录收进“⋯”。 */
export function AccountsPanel(p: AccountsPanelProps) {
  const signedIn = p.platforms.filter((x) => p.status(x.id) === 'signedIn').length;
  const time = p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="max-w-2xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">平台账号</h2>
          <p className="mt-1 text-xs text-muted">
            已登录 {signedIn} / {p.platforms.length} 个平台。登录信息只保存在这台电脑上，各平台互不影响。
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={p.onRefresh} disabled={p.checking}>
          <RefreshCw className={cn(p.checking && 'animate-spin')} />
          {p.checking ? '检测中' : time ? `${time} 更新` : '检测'}
        </Button>
      </div>
      {p.error ? <p className="mt-3 rounded-[var(--radius-ui)] bg-danger-soft px-3 py-2 text-xs text-danger">{p.error}</p> : null}
      <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line" data-testid="accounts-list">
        {p.platforms.map(({ id, name }) => {
          const s = p.status(id);
          const link = PLATFORM_LINKS[id];
          return (
            <li key={id} className="flex items-center gap-3 px-4 py-3" data-testid={`account-${id}`}>
              <span
                aria-hidden
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: link?.color }}
              >
                {link?.short}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{name}</span>
              <AuthStatusBadge status={s} />
              <div className="flex w-[120px] justify-end">
                {s === 'signedIn' ? (
                  <Button size="sm" onClick={() => p.onOpenDashboard(id)}>
                    <ExternalLink />
                    打开后台
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => p.onSignIn(id)} disabled={s === 'checking'}>
                    <LogIn />
                    登录
                  </Button>
                )}
              </div>
              <div className="w-7">
                {s === 'signedIn' ? <MoreMenu items={[{ label: '退出登录', danger: true, onSelect: () => p.onSignOut(id) }]} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
