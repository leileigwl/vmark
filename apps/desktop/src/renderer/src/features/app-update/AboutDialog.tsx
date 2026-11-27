import { ExternalLink, Info, RefreshCw } from 'lucide-react';
import { Button, Dialog } from '../../ui';
import type { AppUpdateController } from './useAppUpdate';

/** 关于弹窗：展示当前版本、作者（leileigwl）、项目链接及手动检查更新入口。 */
export function AboutDialog({ controller }: { controller: AppUpdateController }) {
  const { state, aboutOpen, closeAbout, checkNow, openDialog } = controller;

  if (!aboutOpen) return null;

  const checking = state?.status === 'checking';
  const hasUpdate = state?.status === 'available' || state?.status === 'downloaded';
  const currentLabel = state?.currentVersion ? `v${state.currentVersion}` : 'v0.1.0';

  let statusText = '点击右侧按钮检查 GitHub Releases 最新正式版';
  if (checking) statusText = '正在检查更新…';
  else if (state?.status === 'not-available') statusText = '当前已是最新版本';
  else if (state?.status === 'available' && state.latestVersion) statusText = `发现新版本 v${state.latestVersion}`;
  else if (state?.status === 'downloading') statusText = `正在下载更新 ${state.percent ?? 0}%`;
  else if (state?.status === 'downloaded' && state.latestVersion) statusText = `新版本 v${state.latestVersion} 已就绪`;
  else if (state?.status === 'error' && state.error) statusText = `检查失败：${state.error}`;

  return (
    <Dialog
      open={aboutOpen}
      onOpenChange={(open) => {
        if (!open) closeAbout();
      }}
      className="w-[440px]"
      title={
        <span className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <span>关于 Vmark（维记）</span>
        </span>
      }
      description="本地优先 Markdown 写作与多平台草稿箱分发工作台"
      footer={
        <>
          <a
            href="https://vmark.leileigwl.cn"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--radius-ui)] px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
          >
            <ExternalLink className="size-3.5" />
            官方网站
          </a>
          <a
            href="https://github.com/leileigwl/vmark"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--radius-ui)] px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
          >
            <ExternalLink className="size-3.5" />
            GitHub
          </a>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={closeAbout}>
            关闭
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4 text-xs text-ink">
        <div className="space-y-2 rounded-[var(--radius-ui)] border border-line bg-surface p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-muted">当前版本</span>
            <span className="font-mono font-medium">{currentLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">作者</span>
            <span className="font-medium">leileigwl</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">开源协议</span>
            <span>AGPL-3.0 / Commercial</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-ui)] border border-line bg-surface p-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-medium">更新与版本检测</div>
            <div className="mt-0.5 truncate text-[11.5px] text-muted" title={statusText}>
              {statusText}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasUpdate && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  closeAbout();
                  openDialog();
                }}
              >
                查看更新
              </Button>
            )}
            <Button variant="secondary" size="sm" loading={checking} onClick={() => void checkNow()}>
              <RefreshCw className="size-3.5" />
              检查更新
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
