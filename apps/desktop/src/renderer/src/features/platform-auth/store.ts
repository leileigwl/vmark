import type { PlatformId } from '@vcat/shared';

/** 登录状态：只有这四种。所有界面都从这里读，不再各自判断。 */
export type AuthStatus = 'checking' | 'signedIn' | 'signedOut' | 'error';

export interface PlatformAuthSnapshot {
  statuses: Partial<Record<PlatformId, AuthStatus>>;
  checking: boolean;
  lastCheckedAt: number | null;
  error: string | null;
}

const CHECK_TIMEOUT_MS = 15_000;

let snapshot: PlatformAuthSnapshot = { statuses: {}, checking: false, lastCheckedAt: null, error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let subscribedToMain = false;

function emit(next: Partial<PlatformAuthSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function toStatuses(raw: Partial<Record<PlatformId, boolean>>): Partial<Record<PlatformId, AuthStatus>> {
  const out: Partial<Record<PlatformId, AuthStatus>> = {};
  for (const [id, ok] of Object.entries(raw)) out[id as PlatformId] = ok ? 'signedIn' : 'signedOut';
  return out;
}

function ensureMainSubscription() {
  if (subscribedToMain) return;
  const api = window.electronAPI;
  if (!api?.onPlatformAuthUpdated) return;
  subscribedToMain = true;
  api.onPlatformAuthUpdated((states) => {
    emit({ statuses: { ...snapshot.statuses, ...toStatuses(states) }, lastCheckedAt: Date.now() });
  });
}

/** 重新检测全部平台；并发调用会复用同一次请求。超时标记为 error，不会一直“检测中”。 */
export function refreshPlatformAuth(): Promise<void> {
  ensureMainSubscription();
  if (inflight) return inflight;
  const api = window.electronAPI;
  if (!api?.getPlatformAuthStates) return Promise.resolve();
  const previous = snapshot.statuses;
  emit({ checking: true, error: null });
  inflight = (async () => {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('检测超时，请检查网络后重试')), CHECK_TIMEOUT_MS)
      );
      const raw = await Promise.race([api.getPlatformAuthStates(), timeout]);
      emit({ statuses: toStatuses(raw ?? {}), lastCheckedAt: Date.now(), error: null });
    } catch (err) {
      const marked: Partial<Record<PlatformId, AuthStatus>> = {};
      for (const id of Object.keys(previous) as PlatformId[]) marked[id] = previous[id] === 'signedIn' ? 'signedIn' : 'error';
      emit({ statuses: marked, error: err instanceof Error ? err.message : String(err) });
    } finally {
      emit({ checking: false });
      inflight = null;
    }
  })();
  return inflight;
}

export function subscribePlatformAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlatformAuthSnapshot(): PlatformAuthSnapshot {
  return snapshot;
}

/** 单个平台状态；没检测过时视为 checking（首轮）或 signedOut。 */
export function statusOf(id: PlatformId, snap: PlatformAuthSnapshot = snapshot): AuthStatus {
  const s = snap.statuses[id];
  if (s) return s;
  return snap.checking || snap.lastCheckedAt === null ? 'checking' : 'signedOut';
}

/** 测试用：重置全局状态。 */
export function __resetPlatformAuthForTests() {
  snapshot = { statuses: {}, checking: false, lastCheckedAt: null, error: null };
  inflight = null;
  subscribedToMain = false;
}
