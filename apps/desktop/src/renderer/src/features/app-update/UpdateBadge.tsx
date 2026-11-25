import { ArrowUpCircle, Download, RotateCw } from 'lucide-react';
import { Button } from '../../ui';
import type { AppUpdateController } from './useAppUpdate';

/** Compact TopBar pill badge surfaced silently when a newer stable release is found. */
export function UpdateBadge({ controller }: { controller: AppUpdateController }) {
  if (!controller.hasVisibleBadge || !controller.state) return null;
  const { status, latestVersion, percent } = controller.state;

  const label =
    status === 'downloaded'
      ? '重启更新'
      : status === 'downloading'
        ? `下载中 ${percent ?? 0}%`
        : `有新版本 v${latestVersion}`;

  const Icon = status === 'downloaded' ? RotateCw : status === 'downloading' ? Download : ArrowUpCircle;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={controller.openDialog}
      title={`查看 Vmark v${latestVersion} 更新详情`}
      className="mr-1 h-7 gap-1 rounded-full bg-primary-soft px-2.5 text-[11.5px] font-medium text-primary hover:bg-primary-soft hover:brightness-95 [&_svg]:size-3"
    >
      <Icon className={status === 'downloading' ? 'animate-pulse' : undefined} />
      <span>{label}</span>
    </Button>
  );
}
