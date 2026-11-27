import { app, dialog, type BrowserWindow } from 'electron';
import { findDuplicateMacApps } from './installGuardCore';

/**
 * 启用全平台单实例锁（macOS & Windows）：避免重复启动多开，二次启动时唤起已有主窗口。
 * 当 `VMARK_USER_DATA_DIR` 存在（自动化隔离测试环境）时跳过锁定。
 */
export function setupSingleInstanceLock(
  getMainWindow: () => BrowserWindow | null,
  onSecondInstanceArgv?: (argv: string[]) => void
): boolean {
  if (process.env.VMARK_USER_DATA_DIR) return true;
  const locked = app.requestSingleInstanceLock();
  if (!locked) {
    app.quit();
    return false;
  }
  app.on('second-instance', (_event, argv) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
    if (argv?.length) onSecondInstanceArgv?.(argv);
  });
  return true;
}

/** 配置系统原生「关于」面板信息（兜底展示版本与作者）。 */
export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: 'Vmark（维记）',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © leileigwl',
    credits: '作者：leileigwl',
  });
}

/**
 * macOS 打包版启动自检：
 * 1. 若直接从 DMG 磁盘映像或非「应用程序」目录启动，提示一键移入 `/Applications` 并替换旧版；
 * 2. 若已在「应用程序」中运行但检测到 `Vmark 2.app` 等重复副本，提醒清理并说明升级时选择「替换」。
 */
export async function checkInstallLocationOnStartup(mainWindow: BrowserWindow | null): Promise<void> {
  if (!app.isPackaged || process.platform !== 'darwin') return;

  const showBox = (options: Electron.MessageBoxOptions) =>
    mainWindow && !mainWindow.isDestroyed()
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options);

  if (!app.isInApplicationsFolder()) {
    const { response } = await showBox({
      type: 'question',
      title: '建议移入「应用程序」文件夹',
      message: '检测到 Vmark 当前未安装在「应用程序」文件夹中',
      detail:
        '直接从安装包或下载目录运行可能导致无法正常更新或产生重复副本。是否立即移入「应用程序」？（如已有旧版本将自动替换，本地文章与账号配置不会丢失）',
      buttons: ['移入「应用程序」并替换旧版', '稍后再说'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      try {
        app.moveToApplicationsFolder({
          conflictHandler: (conflictType) => conflictType === 'exists' || conflictType === 'existsAndRunning',
        });
      } catch (err) {
        console.warn('[install-guard] 自动移入 Applications 失败:', err);
      }
    }
    return;
  }

  const duplicates = findDuplicateMacApps('/Applications');
  if (duplicates.length > 0) {
    await showBox({
      type: 'info',
      title: '检测到重复安装的 Vmark 副本',
      message: `「应用程序」中同时存在：${duplicates.join('、')}`,
      detail: '建议只保留一份 Vmark.app（删除多余副本），以后升级新版本拖入时请选择「替换」，即可原地覆盖且不会丢失任何本地数据。',
      buttons: ['知道了'],
    });
  }
}
