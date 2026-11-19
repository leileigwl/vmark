import { session } from 'electron';
import { registerPublishHandlers } from '../../publishHandlers';
import type { MainIpcContext } from '../context';

/** Registers multi-platform draft & publishing IPC handlers. */
export function registerPublishIpc(ctx: MainIpcContext): void {
  registerPublishHandlers({
    ipcMain: ctx.ipcMain,
    session,
    getAppConfig: ctx.readAppConfig,
  });
}
