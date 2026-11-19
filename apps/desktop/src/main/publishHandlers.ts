import type Electron from 'electron';
import type { MultiPlatformPublishPayload, MultiPlatformPublishResultItem } from '@vcat/shared';
import { publishToSingleTarget } from './publishPlatformDispatch';
import {
  checkPlatformAuthStates,
  verifyPlatformAuth,
  type PublishAppConfig,
} from './publishSessionAuth';
import {
  executeWeixinDraftPublish,
  type WeixinDraftIpcPayload,
  type WeixinDraftIpcResult,
} from './publishWeixinDraft';

export { checkPlatformAuthStates, verifyPlatformAuth };

/** Registers main-process IPC handlers for publishing articles to external platforms. */
export function registerPublishHandlers(params: {
  ipcMain: Electron.IpcMain;
  session: typeof Electron.session;
  getAppConfig: () => Promise<PublishAppConfig>;
}): void {
  const { ipcMain, session, getAppConfig } = params;

  ipcMain.handle(
    'publish:weixinDraft',
    async (_event, payload: WeixinDraftIpcPayload): Promise<WeixinDraftIpcResult> => {
      try {
        const cfg = await getAppConfig();
        return await executeWeixinDraftPublish({
          session,
          workspacePath: cfg.workspacePath,
          payload,
        });
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  ipcMain.handle(
    'publish:multiPlatform',
    async (
      _event,
      payload: MultiPlatformPublishPayload
    ): Promise<{ results: MultiPlatformPublishResultItem[] }> => {
      const cfg = await getAppConfig();
      const results = await Promise.all(
        payload.targets.map((target) =>
          publishToSingleTarget({
            platformId: target.platformId,
            mode: target.mode,
            payload,
            cfg,
            session,
          })
        )
      );
      return { results };
    }
  );
}
