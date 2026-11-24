import { session } from 'electron';
import { fetchJuejinCategories } from '../../juejinCategoryRuntime';
import { registerPublishHandlers } from '../../publishHandlers';
import type { MainIpcContext } from '../context';

/** Registers multi-platform draft & publishing IPC handlers. */
export function registerPublishIpc(ctx: MainIpcContext): void {
  const { ipcMain } = ctx;
  registerPublishHandlers({
    ipcMain,
    session,
    getAppConfig: ctx.readAppConfig,
  });
  ipcMain.handle('publish:juejinCategories', () => fetchJuejinCategories());
}
