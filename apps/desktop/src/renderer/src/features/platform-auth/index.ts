import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { PlatformId } from '@vcat/shared';
import {
  getPlatformAuthSnapshot,
  refreshPlatformAuth,
  statusOf,
  subscribePlatformAuth,
  type AuthStatus,
  type PlatformAuthSnapshot,
} from './store';
import { PLATFORM_LINKS } from './platformLinks';

export type { AuthStatus, PlatformAuthSnapshot };
export { refreshPlatformAuth, statusOf, PLATFORM_LINKS };
export { AuthStatusBadge } from './AuthStatusBadge';

/** 平台登录状态的唯一入口。首次挂载时自动检测一次。 */
export function usePlatformAuth() {
  const snap = useSyncExternalStore(subscribePlatformAuth, getPlatformAuthSnapshot, getPlatformAuthSnapshot);
  const neverChecked = snap.lastCheckedAt === null && !snap.checking;
  useEffect(() => {
    if (neverChecked) void refreshPlatformAuth();
  }, [neverChecked]);

  const signIn = useCallback(async (id: PlatformId) => {
    const link = PLATFORM_LINKS[id];
    if (!link || !window.electronAPI?.openPlatformLogin) return;
    await window.electronAPI.openPlatformLogin(id, link.loginUrl);
    await refreshPlatformAuth();
  }, []);

  const openDashboard = useCallback(async (id: PlatformId) => {
    const link = PLATFORM_LINKS[id];
    if (!link || !window.electronAPI?.openPlatformLogin) return;
    await window.electronAPI.openPlatformLogin(id, link.dashboardUrl);
    await refreshPlatformAuth();
  }, []);

  const signOut = useCallback(async (id: PlatformId) => {
    if (!window.electronAPI?.logoutPlatform) return;
    await window.electronAPI.logoutPlatform(id);
    await refreshPlatformAuth();
  }, []);

  return {
    snapshot: snap,
    status: (id: PlatformId) => statusOf(id, snap),
    refresh: refreshPlatformAuth,
    signIn,
    openDashboard,
    signOut,
  };
}
export { AccountsPanel, type AccountRow } from './AccountsPanel';
