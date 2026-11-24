import type { PlatformId } from '@vcat/shared';
import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Button } from '../../ui';
import { SPEC_BY_ID } from './platformSpecs';
import { PlatformIcon } from './PlatformIcon';
import type { RunRow } from './runPublish';

interface PublishResultsProps {
  rows: RunRow[];
  onOpen: (id: PlatformId, url?: string) => void;
}

const ICON = {
  pending: <Circle className="size-4 text-muted" />,
  running: <Loader2 className="size-4 animate-spin text-primary" />,
  ok: <CheckCircle2 className="size-4 text-success" />,
  failed: <XCircle className="size-4 text-danger" />,
};

/** 成功后才有打开按钮：拿到草稿 id 时打开这篇草稿，拿不到时去草稿箱列表。 */
export function openLabel(r: RunRow): string {
  if (SPEC_BY_ID[r.id]?.mode === 'direct') return '查看';
  return r.urlKind === 'draft' ? '打开草稿' : '去草稿箱';
}

/** 推送进度与结果：每个平台一行，成功给“去后台查看”，失败写清原因。 */
export function PublishResults({ rows, onOpen }: PublishResultsProps) {
  const done = rows.filter((r) => r.state === 'ok').length;
  const failed = rows.filter((r) => r.state === 'failed').length;
  const running = rows.some((r) => r.state === 'running' || r.state === 'pending');
  return (
    <div className="mx-auto max-w-[560px] space-y-4 p-6">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">
          {running ? '正在推送…' : failed ? `${done} 个成功，${failed} 个失败` : `已推送到 ${done} 个平台`}
        </h3>
        <p className="mt-0.5 text-xs text-muted">草稿需要到各平台后台确认后才会发出。</p>
      </div>
      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line" data-testid="publish-results">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5" data-state={r.state}>
            {ICON[r.state]}
            <PlatformIcon id={r.id} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink">{SPEC_BY_ID[r.id]?.name ?? r.id}</div>
              {r.message && r.state !== 'ok' ? <div className="truncate text-[11px] text-danger" title={r.message}>{r.message}</div> : null}
            </div>
            {r.state === 'ok' ? (
              <Button variant="ghost" className="h-9" onClick={() => onOpen(r.id, r.url)} data-testid={`open-result-${r.id}`}>
                <ExternalLink />
                {openLabel(r)}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
