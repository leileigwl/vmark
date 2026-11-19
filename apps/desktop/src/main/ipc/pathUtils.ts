import path from 'node:path';
import type { ImageBedConfig, StartupConfig } from '@vcat/shared';

export interface AppConfig {
  workspacePath: string | null;
  recentWorkspaces: string[];
  imageBed: ImageBedConfig;
  startup?: StartupConfig;
}

export const DEFAULT_CONFIG: AppConfig = {
  workspacePath: null,
  recentWorkspaces: [],
  imageBed: { strategy: 'platform_private' },
  startup: { mode: 'last_opened' },
};

/** Inserts or promotes a workspace directory into the bounded MRU list (max 8 entries). */
export function recordRecentWorkspace(cfg: AppConfig, dirPath: string): void {
  cfg.workspacePath = dirPath;
  cfg.recentWorkspaces = [dirPath, ...cfg.recentWorkspaces.filter((p) => p !== dirPath)].slice(0, 8);
}

/** Prevents path traversal outside the active workspace directory. */
export function resolveSafePath(workspaceRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const target = path.resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Access denied: path escapes workspace root');
  }
  return target;
}
