import type { MainIpcContext } from './context';
import { registerAppUpdateIpc } from './app-update/index';
import { registerArticleIpc } from './article/index';
import { registerImageConfigIpc } from './image-config/index';
import { registerPlatformAuthIpc } from './platform-auth/index';
import { registerPublishIpc } from './publish/index';
import { registerWorkspaceIpc } from './workspace/index';

/** Registers all vertical IPC domain islands from a single thin registry table. */
export function registerAllIpcHandlers(ctx: MainIpcContext): void {
  registerWorkspaceIpc(ctx);
  registerArticleIpc(ctx);
  registerImageConfigIpc(ctx);
  registerPlatformAuthIpc(ctx);
  registerPublishIpc(ctx);
  registerAppUpdateIpc(ctx);
}
