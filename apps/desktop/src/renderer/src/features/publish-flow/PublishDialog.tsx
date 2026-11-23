import { useState } from 'react';
import type { ArticleMeta, PlatformId } from '@vcat/shared';
import { Button, Dialog, Field, Input, Textarea, Tooltip } from '../../ui';
import { usePlatformAuth } from '../platform-auth';
import { checkPlatform, type Issue } from './draftModel';
import { PLATFORM_SPECS, SPEC_BY_ID } from './platformSpecs';
import { PlatformList } from './PlatformList';
import { AttentionList } from './AttentionList';
import { TagInput } from './TagInput';
import { PublishResults } from './PublishResults';
import { cropCover } from './coverCrop';
import { runPublish, type RunRow } from './runPublish';
import { usePublishDraft } from './usePublishDraft';

interface PublishDialogProps {
  open: boolean;
  activeArticle: ArticleMeta | null;
  markdown: string;
  onClose: () => void;
}

/** 发布：左边勾选平台，右边是共用的标题/摘要/封面，下方只列需要单独处理的平台；一键推入草稿箱。 */
export function PublishDialog({ open, activeArticle, markdown, onClose }: PublishDialogProps) {
  const auth = usePlatformAuth();
  const { draft, update, bodyImage } = usePublishDraft(activeArticle, markdown);
  const [rows, setRows] = useState<RunRow[] | null>(null);

  const issuesOf = (id: PlatformId): Issue[] => {
    const spec = SPEC_BY_ID[id];
    return spec ? checkPlatform(draft, spec, spec.kind === 'site' || auth.status(id) === 'signedIn', bodyImage) : [];
  };
  const selectedSpecs = PLATFORM_SPECS.filter((s) => draft.selected.includes(s.id));
  const ready = selectedSpecs.filter((s) => !issuesOf(s.id).some((i) => i.level === 'error')).map((s) => s.id);
  const blocked = selectedSpecs.filter((s) => !ready.includes(s.id));
  const showTags = selectedSpecs.some((s) => s.tags);

  const toggle = (id: PlatformId, on: boolean) =>
    update((d) => ({ selected: on ? [...d.selected.filter((x) => x !== id), id] : d.selected.filter((x) => x !== id) }));

  const run = async (targets: PlatformId[]) => {
    setRows((prev) =>
      prev ? prev.map((r) => (targets.includes(r.id) ? { id: r.id, state: 'pending' } : r)) : targets.map((id) => ({ id, state: 'pending' }))
    );
    await runPublish(draft, markdown, targets, (row) => setRows((prev) => (prev ?? []).map((r) => (r.id === row.id ? row : r))), {
      bodyImage,
      crop: cropCover,
    });
  };

  const running = rows?.some((r) => r.state === 'running' || r.state === 'pending') ?? false;
  const failedIds = rows?.filter((r) => r.state === 'failed').map((r) => r.id) ?? [];

  const footer = rows ? (
    <>
      <div className="flex-1" />
      {failedIds.length && !running ? (
        <Button className="h-10" onClick={() => void run(failedIds)}>
          重试失败的 {failedIds.length} 个
        </Button>
      ) : null}
      <Button variant="ghost" className="h-10" onClick={() => setRows(null)} disabled={running}>
        返回修改
      </Button>
      <Button variant="primary" size="lg" onClick={onClose} disabled={running}>
        完成
      </Button>
    </>
  ) : (
    <>
      <div className="min-w-0 flex-1 truncate text-xs text-muted">
        {blocked.length ? `${blocked.map((s) => s.short).join('、')} 暂不推送` : '确认后再到各平台后台发出'}
      </div>
      <Tooltip content={draft.selected.includes('github_static') ? 'GitHub 博客会直接上线，其余进草稿箱' : '全部进入各平台草稿箱'}>
        <span>
          <Button variant="primary" size="lg" disabled={ready.length === 0} onClick={() => void (setRows(null), run(ready))} data-testid="publish-start">
            推送到 {ready.length} 个草稿箱
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
      description="默认推入各平台草稿箱"
      footer={footer}
      className="h-[82vh] w-[1000px]"
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
        <div className="grid h-full grid-cols-[272px_1fr]">
          <aside className="min-h-0 border-r border-line bg-surface">
            <PlatformList
              selected={draft.selected}
              onToggle={toggle}
              issuesOf={issuesOf}
              statusOf={auth.status}
              onSignIn={(id) => void auth.signIn(id)}
              checking={auth.snapshot.checking}
              onRefresh={() => void auth.refresh()}
            />
          </aside>
          <main className="min-h-0 space-y-7 overflow-y-auto px-8 py-6">
            <section className="space-y-5">
              <Field label="标题" htmlFor="pub-title" count={{ value: [...draft.title].length }}>
                <Input id="pub-title" className="h-9" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field label="摘要" htmlFor="pub-digest" count={{ value: [...draft.digest].length }}>
                <Textarea id="pub-digest" value={draft.digest} onChange={(e) => update({ digest: e.target.value })} />
              </Field>
              {showTags ? (
                <Field label="标签" htmlFor="pub-tags">
                  <TagInput id="pub-tags" value={draft.tags} onChange={(tags) => update({ tags })} placeholder="回车添加" />
                </Field>
              ) : null}
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-medium text-ink">需要单独处理</h3>
              <AttentionList draft={draft} specs={selectedSpecs} markdown={markdown} issuesOf={issuesOf} onChange={update} />
            </section>
          </main>
        </div>
      )}
    </Dialog>
  );
}
