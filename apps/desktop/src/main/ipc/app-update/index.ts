import { IPC_INVOKE_CHANNELS } from '@vcat/shared';
import { createAppUpdaterService } from '../../appUpdaterService';
import type { MainIpcContext } from '../context';

/** Registers application update check, download, install, and release-link IPC handlers. */
export function registerAppUpdateIpc(ctx: MainIpcContext): void {
  const service = createAppUpdaterService(ctx.getMainWindow);
  const { ipcMain } = ctx;

  ipcMain.handle(IPC_INVOKE_CHANNELS.getAppUpdateState, () => service.getState());
  ipcMain.handle(IPC_INVOKE_CHANNELS.checkAppUpdate, (_event, options?: { manual?: boolean }) =>
    service.checkForUpdates(Boolean(options?.manual))
  );
  ipcMain.handle(IPC_INVOKE_CHANNELS.downloadAppUpdate, () => service.downloadUpdate());
  ipcMain.handle(IPC_INVOKE_CHANNELS.installAppUpdate, () => service.installUpdate());
  ipcMain.handle(IPC_INVOKE_CHANNELS.openAppUpdateRelease, () => service.openReleasePage());
}
