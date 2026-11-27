import { ExternalLink, Sparkles } from 'lucide-react';
import { Button, Dialog } from '../../ui';
import type { AppUpdateController } from './useAppUpdate';

/** Modal displaying version delta, release notes, download progress, and install/download actions. */
export function UpdateDialog({ controller }: { controller: AppUpdateController }) {
  const { state, dialogOpen, closeDialog, startDownload, installNow, openReleasePage, skipCurrentVersion } =
    controller;

  if (!dialogOpen || !state) return null;

  const isAuto = state.mode === 'auto';
  const isDownloading = state.status === 'downloading';
  const isDownloaded = state.status === 'downloaded';
  const latestLabel = state.latestVersion ? `v${state.latestVersion}` : '最新版本';
  const currentLabel = `v${state.currentVersion}`;
  const notes = state.releaseNotes?.trim() || '包含稳定性修复与功能优化，建议更新至最新版本。';

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
      className="w-[480px]"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span>{isDownloaded ? `新版本已就绪 ${latestLabel}` : `发现新版本 ${latestLabel}`}</span>
        </span>
      }
      description={`当前版本 ${currentLabel} → 最新版本 ${latestLabel}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => void openReleasePage()}>
            <ExternalLink className="size-3.5" />
            查看 Release 页面
          </Button>
          <div className="flex-1" />
          {state.latestVersion && !isDownloading && !isDownloaded && (
            <Button variant="ghost" size="sm" onClick={skipCurrentVersion}>
              跳过此版本
            </Button>
          )}
          {isAuto ? (
            isDownloaded ? (
              <Button variant="primary" size="sm" onClick={() => void installNow()}>
                立即重启并安装
              </Button>
            ) : (
              <Button variant="primary" size="sm" disabled={isDownloading} loading={isDownloading} onClick={() => void startDownload()}>
                {isDownloading ? `正在下载 ${state.percent ?? 0}%` : '立即增量更新'}
              </Button>
            )
          ) : (
            <Button variant="primary" size="sm" onClick={() => void startDownload()}>
              下载新版安装包
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 px-5 py-4 text-xs text-ink">
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-ui)] border border-line bg-surface p-3 leading-relaxed">
          {notes}
        </div>

        {isDownloading && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>正在下载增量更新包…</span>
              <span className="tabular-nums">{state.percent ?? 0}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, state.percent ?? 0))}%` }}
              />
            </div>
          </div>
        )}

        {!isAuto && state.status === 'available' && (
          <p className="text-[11.5px] text-muted">
            将打开系统浏览器直链下载当前平台安装包；macOS 拖入「应用程序」时请选择「替换」覆盖旧版（不会丢失本地文章与账号配置）。
          </p>
        )}

        {state.status === 'error' && state.error && (
          <p className="rounded-[var(--radius-ui)] border border-danger/30 bg-danger/10 px-3 py-2 text-[11.5px] text-danger">
            更新失败：{state.error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
