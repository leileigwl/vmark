import { useCallback, useEffect, useState } from 'react';
import type { AppUpdateState } from '@vcat/shared';

const SKIPPED_VERSION_KEY = 'vmark.skippedUpdateVersion';
const STARTUP_CHECK_DELAY_MS = 3000;

function readSkippedVersion(): string | null {
  try {
    return window.localStorage.getItem(SKIPPED_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeSkippedVersion(version: string | null): void {
  try {
    if (version) window.localStorage.setItem(SKIPPED_VERSION_KEY, version);
    else window.localStorage.removeItem(SKIPPED_VERSION_KEY);
  } catch {
    // Ignore storage quota / disabled localStorage errors in sandboxed renderers.
  }
}

export interface AppUpdateController {
  state: AppUpdateState | null;
  dialogOpen: boolean;
  aboutOpen: boolean;
  hasVisibleBadge: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  openAbout: () => void;
  closeAbout: () => void;
  checkNow: () => Promise<void>;
  startDownload: () => Promise<void>;
  installNow: () => Promise<void>;
  openReleasePage: () => Promise<void>;
  skipCurrentVersion: () => void;
}

/** Manages silent startup update checks, TopBar badge visibility, About dialog, and update actions. */
export function useAppUpdate(): AppUpdateController {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [skippedVersion, setSkippedVersion] = useState<string | null>(() => readSkippedVersion());

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    let active = true;

    void api.getAppUpdateState?.().then((initial) => {
      if (active && initial) setState(initial);
    });

    const unbind = api.onAppUpdateState?.((next) => {
      if (active) setState(next);
    });

    const timer = window.setTimeout(() => {
      void api.checkAppUpdate?.({ manual: false }).then((next) => {
        if (active && next) setState(next);
      });
    }, STARTUP_CHECK_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
      unbind?.();
    };
  }, []);

  const hasVisibleBadge = Boolean(
    state &&
      (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded') &&
      state.latestVersion &&
      state.latestVersion !== skippedVersion
  );

  const checkNow = useCallback(async () => {
    const next = await window.electronAPI?.checkAppUpdate?.({ manual: true });
    if (!next) return;
    setState(next);
    if (next.status === 'available' || next.status === 'downloaded') {
      if (next.latestVersion && next.latestVersion === skippedVersion) {
        setSkippedVersion(null);
        writeSkippedVersion(null);
      }
      setAboutOpen(false);
      setDialogOpen(true);
    }
  }, [skippedVersion]);

  useEffect(() => {
    const unbind = window.electronAPI?.onMenuAction?.((action) => {
      if (action === 'app:about') {
        setAboutOpen(true);
      } else if (action === 'app:checkUpdate') {
        setAboutOpen(true);
        void checkNow();
      }
    });
    return () => unbind?.();
  }, [checkNow]);

  const startDownload = useCallback(async () => {
    const next = await window.electronAPI?.downloadAppUpdate?.();
    if (next) setState(next);
  }, []);

  const installNow = useCallback(async () => {
    const res = await window.electronAPI?.installAppUpdate?.();
    if (res && !res.ok && res.message) {
      setState((prev) => (prev ? { ...prev, status: 'error', error: res.message } : prev));
    }
  }, []);

  const openReleasePage = useCallback(async () => {
    await window.electronAPI?.openAppUpdateRelease?.();
  }, []);

  const skipCurrentVersion = useCallback(() => {
    const ver = state?.latestVersion ?? null;
    if (ver) {
      setSkippedVersion(ver);
      writeSkippedVersion(ver);
    }
    setDialogOpen(false);
  }, [state?.latestVersion]);

  return {
    state,
    dialogOpen,
    aboutOpen,
    hasVisibleBadge,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
    openAbout: () => setAboutOpen(true),
    closeAbout: () => setAboutOpen(false),
    checkNow,
    startDownload,
    installNow,
    openReleasePage,
    skipCurrentVersion,
  };
}
