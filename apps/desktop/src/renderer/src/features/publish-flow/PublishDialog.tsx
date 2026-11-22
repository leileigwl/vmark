import { useMemo, useState } from 'react';
import { renderWeixinHtml } from '@vcat/core/weixin';
import type { ArticleMeta, PlatformId } from '@vcat/shared';
import { Copy } from 'lucide-react';
import { Button, Dialog, Tooltip } from '../../ui';
import { usePlatformAuth } from '../platform-auth';
import { checkPlatform, type Issue } from './draftModel';
import { PLATFORM_SPECS, SPEC_BY_ID, type CoverRatio } from './platformSpecs';
import { PlatformList } from './PlatformList';
import { CommonPanel } from './CommonPanel';
import { PlatformPanel } from './PlatformPanel';
import { PublishResults } from './PublishResults';
import { runPublish, type RunRow } from './runPublish';
import { usePublishDraft } from './usePublishDraft';

interface PublishDialogProps {
  open: boolean;
  activeArticle: ArticleMeta | null;
  markdown: string;
  onClose: () => void;
}

/** 发布：左边选平台，右边逐个适配（标题/摘要/封面比例），一键推入草稿箱。 */
export function PublishDialog({ open, activeArticle, markdown, onClose }: PublishDialogProps) {
  const auth = usePlatformAuth();
  const { draft, update, autoDigest, candidates } = usePublishDraft(activeArticle, markdown);
  const [active, setActive] = useState<PlatformId | 'common'>('common');
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const issuesOf = (id: PlatformId): Issue[] => {
    const spec = SPEC_BY_ID[id];
    return spec ? checkPlatform(draft, spec, auth.status(id) === 'signedIn') : [];
  };
  const selected = draft.selected.filter((id) => SPEC_BY_ID[id]);
  const ready = selected.filter((id) => !issuesOf(id).some((i) => i.level === 'error'));
  const blocked = selected.filter((id) => !ready.includes(id));

  const ratios = useMemo(() => {
    const map = new Map<CoverRatio, string[]>();
    for (const s of PLATFORM_SPECS) {
      if (!s.cover || !draft.selected.includes(s.id)) continue;
      map.set(s.cover.ratio, [...(map.get(s.cover.ratio) ?? []), s.name]);
    }
    return [...map.entries()].map(([ratio, platforms]) => ({ ratio, platforms }));
  }, [draft.selected]);

  const toggle = (id: PlatformId, on: boolean) =>
    update({ selected: on ? [...draft.selected.filter((x) => x !== id), id] : draft.selected.filter((x) => x !== id) });

  const start = async () => {
    const targets = ready;
    setRows(targets.map((id) => ({ id, state: 'pending' })));
    await runPublish(draft, markdown, targets, (row) =>
      setRows((prev) => (prev ?? []).map((r) => (r.id === row.id ? row : r)))
    );
  };

  const copyWeixin = async () => {
    const html = renderWeixinHtml(markdown, { coverImageUrl: draft.coverCrops['2.35:1'] ?? draft.coverSource }).html;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        }),
      ]);
      setToast('已复制公众号富文本，可直接粘贴到公众号编辑器');
    } catch {
      setToast('复制失败，请检查剪贴板权限');
    }
    setTimeout(() => setToast(null), 2500);
  };

  const running = rows?.some((r) => r.state === 'running' || r.state === 'pending') ?? false;
  const failedIds = rows?.filter((r) => r.state === 'failed').map((r) => r.id) ?? [];
  const spec = active !== 'common' ? SPEC_BY_ID[active] : undefined;

  const footer = rows ? (
    <>
      <div className="flex-1" />
      {failedIds.length && !running ? (
        <Button
          onClick={() =>
            void (async () => {
              setRows((prev) => (prev ?? []).map((r) => (failedIds.includes(r.id) ? { id: r.id, state: 'pending' } : r)));
              await runPublish(draft, markdown, failedIds, (row) => setRows((prev) => (prev ?? []).map((r) => (r.id === row.id ? row : r))));
            })()
          }
        >
          重试失败的 {failedIds.length} 个
        </Button>
      ) : null}
      <Button variant="ghost" onClick={() => setRows(null)} disabled={running}>
        返回修改
      </Button>
      <Button variant="primary" onClick={onClose} disabled={running}>
        完成
      </Button>
    </>
  ) : (
    <>
      <div className="min-w-0 flex-1 text-xs text-muted">
        {toast ?? (selected.length === 0 ? '在左侧勾选要发布的平台' : `已选 ${selected.length} 个平台，${ready.length} 个已就绪`)}
      </div>
      <Tooltip
        content={
          blocked.length
            ? `以下平台暂不推送：${blocked.map((id) => SPEC_BY_ID[id]?.name).join('、')}`
            : '各平台都会进入草稿箱，GitHub 博客直接上线'
        }
      >
        <span>
          <Button variant="primary" size="lg" disabled={ready.length === 0} onClick={() => void start()} data-testid="publish-start">
            {blocked.length && ready.length ? `推送已就绪的 ${ready.length} 个` : `推送到草稿箱${ready.length ? ` (${ready.length})` : ''}`}
          </Button>
        </span>
      </Tooltip>
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !running) onClose();
      }}
      title={`发布「${draft.title || '未命名文章'}」`}
      description="默认推入各平台草稿箱，确认后再在平台上发出"
      footer={footer}
      className="h-[80vh] w-[980px]"
    >
      {rows ? (
        <div className="h-full overflow-y-auto">
          <PublishResults
            rows={rows}
            onOpen={(id, url) => {
              if (url && window.electronAPI?.openPlatformLogin) void window.electronAPI.openPlatformLogin(id, url);
              else void auth.openDashboard(id);
            }}
          />
        </div>
      ) : (
        <div className="grid h-full grid-cols-[260px_1fr]">
          <aside className="min-h-0 border-r border-line bg-surface">
            <PlatformList
              active={active}
              onActivate={setActive}
              selected={draft.selected}
              onToggle={toggle}
              issuesOf={issuesOf}
              statusOf={auth.status}
              onSignIn={(id) => void auth.signIn(id)}
              checking={auth.snapshot.checking}
              onRefresh={() => void auth.refresh()}
              lastCheckedAt={auth.snapshot.lastCheckedAt}
            />
          </aside>
          <main className="min-h-0 overflow-y-auto px-6 py-5">
            {spec ? (
              <PlatformPanel
                key={spec.id}
                spec={spec}
                draft={draft}
                markdown={markdown}
                status={spec.kind === 'site' ? 'signedIn' : auth.status(spec.id)}
                issues={issuesOf(spec.id)}
                onChange={update}
                onSignIn={() => void auth.signIn(spec.id)}
                onOpenDashboard={() => void auth.openDashboard(spec.id)}
                onSignOut={() => void auth.signOut(spec.id)}
                onEditCommon={() => setActive('common')}
                extraMenu={spec.id === 'weixin' ? [{ label: '复制公众号富文本', onSelect: () => void copyWeixin(), icon: <Copy /> }] : undefined}
              />
            ) : (
              <CommonPanel draft={draft} autoDigest={autoDigest} candidates={candidates} ratios={ratios} onChange={update} />
            )}
          </main>
        </div>
      )}
    </Dialog>
  );
}
