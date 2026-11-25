import { app, shell, type BrowserWindow } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { IPC_EVENT_CHANNELS, type AppUpdateState } from '@vcat/shared';
import {
  checkGithubLatestRelease,
  DEFAULT_GITHUB_REPO,
  DEFAULT_RELEASE_PAGE_URL,
  isNewerStableVersion,
  normalizeVersionTag,
} from './appUpdaterCore';

function canUseAutoUpdater(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return true;
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  return false;
}

function formatReleaseNotes(raw: UpdateInfo['releaseNotes']): string {
  if (!raw) return '';
  const text = Array.isArray(raw)
    ? raw.map((item) => item?.note ?? '').filter(Boolean).join('\n\n')
    : String(raw);
  return text.replace(/<[^>]+>/g, '').trim();
}

function isAllowedExternalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface AppUpdaterController {
  getState: () => AppUpdateState;
  checkForUpdates: (manual?: boolean) => Promise<AppUpdateState>;
  downloadUpdate: () => Promise<AppUpdateState>;
  installUpdate: () => { ok: boolean; message?: string };
  openReleasePage: () => Promise<boolean>;
}

/**
 * Manages application update checks, differential downloads via electron-updater,
 * and fallback GitHub Releases link resolution when native auto-update is unavailable.
 */
export function createAppUpdaterService(getMainWindow: () => BrowserWindow | null): AppUpdaterController {
  const currentVersion = normalizeVersionTag(app.getVersion());
  let state: AppUpdateState = {
    status: 'idle',
    currentVersion,
    mode: canUseAutoUpdater() ? 'auto' : 'manual',
  };
  let listenersWired = false;
  let activeCheck: Promise<AppUpdateState> | null = null;

  const publish = (next: AppUpdateState): AppUpdateState => {
    state = next;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_EVENT_CHANNELS.onAppUpdateState, state);
    }
    return state;
  };

  const wireAutoUpdaterEvents = (): void => {
    if (listenersWired) return;
    listenersWired = true;
    autoUpdater.autoDownload = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('download-progress', (info: ProgressInfo) => {
      publish({
        ...state,
        mode: 'auto',
        status: 'downloading',
        percent: Math.min(100, Math.max(0, Math.round(info.percent))),
        transferredBytes: info.transferred,
        totalBytes: info.total,
        error: undefined,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      const ver = normalizeVersionTag(info.version);
      publish({
        ...state,
        mode: 'auto',
        status: 'downloaded',
        latestVersion: ver,
        releaseName: info.releaseName || `v${ver}`,
        releaseNotes: formatReleaseNotes(info.releaseNotes) || state.releaseNotes,
        releaseUrl: state.releaseUrl || `https://github.com/${DEFAULT_GITHUB_REPO}/releases/tag/v${ver}`,
        percent: 100,
        error: undefined,
      });
    });

    autoUpdater.on('error', (err) => {
      if (state.status !== 'downloading') return;
      publish({
        ...state,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const runGithubFallback = async (manual: boolean): Promise<AppUpdateState> => {
    const result = await checkGithubLatestRelease({
      currentVersion,
      platform: process.platform,
      arch: process.arch,
    });
    if (result.status === 'error' && !manual) {
      return publish({
        status: 'idle',
        currentVersion,
        mode: canUseAutoUpdater() ? 'auto' : 'manual',
        checkedAt: result.checkedAt,
      });
    }
    return publish(result);
  };

  const checkForUpdates = async (manual = false): Promise<AppUpdateState> => {
    if (activeCheck) return activeCheck;
    if (state.status === 'downloading' || state.status === 'downloaded') return state;

    activeCheck = (async () => {
      publish({
        ...state,
        status: 'checking',
        error: undefined,
      });

      if (!canUseAutoUpdater()) {
        return runGithubFallback(manual);
      }

      wireAutoUpdaterEvents();
      try {
        const res = await autoUpdater.checkForUpdates();
        const info = res?.updateInfo;
        const ver = info ? normalizeVersionTag(info.version) : '';
        if (res?.isUpdateAvailable && info && isNewerStableVersion(currentVersion, ver)) {
          return publish({
            status: 'available',
            currentVersion,
            latestVersion: ver,
            releaseName: info.releaseName || `v${ver}`,
            releaseNotes: formatReleaseNotes(info.releaseNotes),
            releaseUrl: `https://github.com/${DEFAULT_GITHUB_REPO}/releases/tag/v${ver}`,
            mode: 'auto',
            checkedAt: Date.now(),
          });
        }
        return publish({
          status: 'not-available',
          currentVersion,
          mode: 'auto',
          checkedAt: Date.now(),
        });
      } catch {
        // Release may not carry latest*.yml yet; fall back cleanly to GitHub Releases API.
        return runGithubFallback(manual);
      }
    })();

    try {
      return await activeCheck;
    } finally {
      activeCheck = null;
    }
  };

  const downloadUpdate = async (): Promise<AppUpdateState> => {
    if (state.mode === 'auto' && state.status === 'available') {
      wireAutoUpdaterEvents();
      publish({ ...state, status: 'downloading', percent: 0, error: undefined });
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        return publish({
          ...state,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return state;
    }

    const target = state.downloadUrl || state.releaseUrl || DEFAULT_RELEASE_PAGE_URL;
    if (isAllowedExternalUrl(target)) {
      await shell.openExternal(target);
    }
    return state;
  };

  const installUpdate = (): { ok: boolean; message?: string } => {
    if (state.mode === 'auto' && state.status === 'downloaded') {
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
      return { ok: true };
    }
    return { ok: false, message: '更新包尚未下载完成' };
  };

  const openReleasePage = async (): Promise<boolean> => {
    const target = state.releaseUrl || DEFAULT_RELEASE_PAGE_URL;
    if (!isAllowedExternalUrl(target)) return false;
    await shell.openExternal(target);
    return true;
  };

  return {
    getState: () => state,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    openReleasePage,
  };
}
