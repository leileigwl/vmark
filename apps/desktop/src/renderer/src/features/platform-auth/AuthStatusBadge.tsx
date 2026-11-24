import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Badge } from '../../ui';
import type { AuthStatus } from './store';

const META: Record<AuthStatus, { label: string; tone: 'success' | 'neutral' | 'danger'; icon: ReactNode }> = {
  signedIn: { label: '已登录', tone: 'success', icon: <CheckCircle2 className="size-3" /> },
  signedOut: { label: '未登录', tone: 'neutral', icon: <Circle className="size-3" /> },
  checking: { label: '检测中', tone: 'neutral', icon: <Loader2 className="size-3 animate-spin" /> },
  error: { label: '检测失败', tone: 'danger', icon: <AlertCircle className="size-3" /> },
};

export function AuthStatusBadge({ status }: { status: AuthStatus }) {
  const m = META[status];
  return (
    <Badge tone={m.tone} data-auth-status={status}>
      {m.icon}
      {m.label}
    </Badge>
  );
}
