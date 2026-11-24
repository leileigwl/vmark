import type { PlatformId } from '@vcat/shared';
import { PLATFORM_LINKS } from './platformLinks.ts';

/** 登录状态：只有这四种。所有界面都从这里读，不再各自判断。 */
export type AuthStatus = 'checking' | 'signedIn' | 'signedOut' | 'error';

export interface PlatformAuthSnapshot {
  statuses: Partial<Record<PlatformId, AuthStatus>>;
  checking: boolean;
  lastCheckedAt: number | null;
  error: string | null;
}

/** 整轮兜底超时：主进程每个平台 8s 独立超时，这里只防 IPC 本身卡死。 */
const CHECK_TIMEOUT_MS = 12_000;

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

/** 主进程逐平台推送（每个平台一出结果就推一次）与心跳广播都走这里：收到哪个平台就立即更新哪个。 */
function ensureMainSubscription() {
  if (subscribedToMain) return;
  const api = window.electronAPI;
  if (!api?.onPlatformAuthUpdated) return;
  subscribedToMain = true;
  api.onPlatformAuthUpdated((states) => {
    emit({ statuses: { ...snapshot.statuses, ...toStatuses(states) } });
  });
}

/**
 * 重新检测全部平台；并发调用会复用同一次请求。
 * 开始时每个平台立刻显示「检测中」（不留旧值）；各平台结果由主进程逐个推回、各自更新；
 * 这一轮结束仍没回来的平台（单平台超时）标为 error，不会一直「检测中」。
 */
export function refreshPlatformAuth(): Promise<void> {
  ensureMainSubscription();
  if (inflight) return inflight;
  const api = window.electronAPI;
  if (!api?.getPlatformAuthStates) return Promise.resolve();
  const ids = new Set<PlatformId>([...(Object.keys(PLATFORM_LINKS) as PlatformId[]), ...(Object.keys(snapshot.statuses) as PlatformId[])]);
  const checkingAll: Partial<Record<PlatformId, AuthStatus>> = {};
  for (const id of ids) checkingAll[id] = 'checking';
  emit({ checking: true, error: null, statuses: checkingAll });
  inflight = (async () => {
    let error: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('检测超时，请检查网络后重试')), CHECK_TIMEOUT_MS);
      });
      const raw = await Promise.race([api.getPlatformAuthStates(), timeout]);
      emit({ statuses: { ...snapshot.statuses, ...toStatuses(raw ?? {}) } });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
      const statuses = { ...snapshot.statuses };
      const late: PlatformId[] = [];
      for (const id of Object.keys(statuses) as PlatformId[]) {
        if (statuses[id] !== 'checking') continue;
        statuses[id] = 'error';
        late.push(id);
      }
      if (!error && late.length) error = `${late.length} 个平台检测超时，可稍后再刷新`;
      emit({ statuses, checking: false, lastCheckedAt: Date.now(), error });
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
