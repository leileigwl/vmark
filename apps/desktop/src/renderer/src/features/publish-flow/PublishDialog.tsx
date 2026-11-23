import { useEffect, useRef, useState } from 'react';
import type { ArticleMeta, PlatformId } from '@vcat/shared';
import { Button, Dialog, Field, Input, Textarea, Tooltip } from '../../ui';
import { usePlatformAuth } from '../platform-auth';
import { checkPlatform, type Issue } from './draftModel';
import { PLATFORM_SPECS, SPEC_BY_ID } from './platformSpecs';
import { PlatformList } from './PlatformList';
import { AttentionList } from './AttentionList';
import { CoverField } from './CoverField';
import { TagInput } from './TagInput';
import { WeixinSection } from './WeixinSection';
import { SocialSection } from './SocialSection';
import { PublishResults } from './PublishResults';
import { cropCover } from './coverCrop';
import { runPublish, type RunRow } from './runPublish';
import { usePublishDraft } from './usePublishDraft';
import { selectPushable } from './platformSelection';

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
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { refresh } = auth;
  // 每次打开发布弹窗都全量检测一次登录状态（各平台结果回来就各自更新）。
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const issuesOf = (id: PlatformId): Issue[] => {
    const spec = SPEC_BY_ID[id];
    return spec ? checkPlatform(draft, spec, spec.kind === 'site' || auth.status(id) === 'signedIn', bodyImage) : [];
  };
  const selectedSpecs = PLATFORM_SPECS.filter((s) => draft.selected.includes(s.id));
  const ready = selectedSpecs.filter((s) => !issuesOf(s.id).some((i) => i.level === 'error')).map((s) => s.id);
  const blocked = selectedSpecs.filter((s) => !ready.includes(s.id));
  // 通用区服务于文章类平台；小红书/抖音有自己的分区。
  const articleSpecs = selectedSpecs.filter((s) => s.kind !== 'cards');
  const cardSpecs = selectedSpecs.filter((s) => s.kind === 'cards');
  const weixinOn = draft.selected.includes('weixin');
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
        <div className="grid h-full grid-cols-[300px_1fr]">
          <aside className="min-h-0 border-r border-line bg-surface">
            <PlatformList
              selected={draft.selected}
              onToggle={toggle}
              issuesOf={issuesOf}
              statusOf={auth.status}
              onSignIn={(id) => void auth.signIn(id)}
              onOpenBrowser={(id) => void auth.openDashboard(id)}
              checking={auth.snapshot.checking}
              onRefresh={() => void auth.refresh()}
              onSelectPushable={() => update((d) => ({ selected: selectPushable(d.selected, auth.status) }))}
            />
          </aside>
          <main className="min-h-0 space-y-10 overflow-y-auto px-10 py-8">
            {selectedSpecs.length === 0 ? <p className="text-xs text-muted">在左侧勾选要发布的平台。</p> : null}
            <section className="space-y-6" data-testid="general-section">
              <div>
                <h3 className="text-sm font-medium text-ink">通用内容</h3>
                <p className="mt-1 text-xs text-muted">默认铺给所有勾选的平台</p>
              </div>
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
              {articleSpecs.some((s) => s.cover) ? (
                <CoverField draft={draft} onChange={update} inputRef={coverInputRef} />
              ) : null}
            </section>
            <AttentionList draft={draft} specs={selectedSpecs} issuesOf={issuesOf} onChange={update} coverInputRef={coverInputRef} bodyImage={bodyImage} />
            {weixinOn || cardSpecs.length ? (
              <section className="space-y-3">
                <h3 className="text-xs font-medium text-muted">平台专属</h3>
                {weixinOn ? <WeixinSection draft={draft} markdown={markdown} bodyImage={bodyImage} issues={issuesOf('weixin').filter((i) => i.field === 'cover')} onChange={update} /> : null}
                {cardSpecs.length ? <SocialSection draft={draft} specs={cardSpecs} markdown={markdown} issuesOf={issuesOf} onChange={update} /> : null}
              </section>
            ) : null}
          </main>
        </div>
      )}
    </Dialog>
  );
}
