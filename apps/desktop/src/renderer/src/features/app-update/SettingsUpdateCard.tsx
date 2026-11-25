import { RefreshCw } from 'lucide-react';
import { Button } from '../../ui';
import type { AppUpdateController } from './useAppUpdate';

/** Settings card for displaying current version and manually triggering update checks. */
export function SettingsUpdateCard({ controller }: { controller: AppUpdateController }) {
  const { state, checkNow, openDialog } = controller;
  const checking = state?.status === 'checking';
  const current = state?.currentVersion ? `v${state.currentVersion}` : '本地版本';

  let statusText = '自动静默检测 GitHub Releases 正式版';
  if (checking) statusText = '正在检查新版本…';
  else if (state?.status === 'not-available') statusText = '当前已是最新版本';
  else if (state?.status === 'available' && state.latestVersion) statusText = `发现新版本 v${state.latestVersion}`;
  else if (state?.status === 'downloaded' && state.latestVersion) statusText = `新版本 v${state.latestVersion} 已下载就绪`;
  else if (state?.status === 'error' && state.error) statusText = `检查失败：${state.error}`;

  return (
    <div className="flex items-center justify-between gap-4 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-[13px]">
      <div>
        <div className="font-medium">应用版本与更新（{current}）</div>
        <div className="mt-0.5 text-xs text-[var(--control-text-color)]">{statusText}</div>
      </div>
      <div className="flex items-center gap-2">
        {(state?.status === 'available' || state?.status === 'downloaded') && (
          <Button variant="secondary" size="sm" onClick={openDialog}>
            查看更新
          </Button>
        )}
        <Button variant="secondary" size="sm" loading={checking} onClick={() => void checkNow()}>
          <RefreshCw className="size-3.5" />
          检查更新
        </Button>
      </div>
    </div>
  );
}
