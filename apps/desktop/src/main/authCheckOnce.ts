/**
 * 主进程账号检测只有一个入口：心跳、窗口聚焦同时触发时复用同一次检测，
 * 所有界面拿到的是同一份结果（不会一处「已授权」、另一处还在「检测中」）。
 *
 * 用户点「刷新」（fresh）时不复用正在跑的那一轮——它可能在用户刚登录之前就开始了，
 * 会把旧结果当新结果；此时开新一轮，旧一轮通过 isLatest() 得知自己已过期、不再广播。
 */
export type SharedCheck<T> = ((opts?: { fresh?: boolean }) => Promise<T>) & {
  /** 使当前进行中的检测轮次失效（登录/登出后调用，防止旧心跳回写覆盖新状态）。 */
  invalidate: () => void;
};

export function createSharedCheck<T>(
  run: (ctx: { isLatest: () => boolean }) => Promise<T>
): SharedCheck<T> {
  let inflight: Promise<T> | null = null;
  let generation = 0;
  const check = ((opts?: { fresh?: boolean }) => {
    if (inflight && !opts?.fresh) return inflight;
    const mine = ++generation;
    const p = run({ isLatest: () => mine === generation }).finally(() => {
      if (inflight === p) inflight = null;
    });
    inflight = p;
    return p;
  }) as SharedCheck<T>;
  check.invalidate = () => {
    generation += 1;
    inflight = null;
  };
  return check;
}

/** 单个平台的检测上限：超时的平台记为 timedOut，不拖住其他平台（给公众号等双跳检测留足 15s）。 */
export const PER_PLATFORM_TIMEOUT_MS = 15_000;

/**
 * 并发检测每个平台，每个平台独立超时；某个平台一出结果就调用 onResult（界面立即更新），
 * 不等全部完成。检测抛错按未登录处理。
 */
export async function checkEachWithTimeout<Id extends string>(
  ids: readonly Id[],
  check: (id: Id) => Promise<boolean>,
  opts: { timeoutMs: number; onResult?: (id: Id, ok: boolean) => void }
): Promise<{ states: Partial<Record<Id, boolean>>; timedOut: Id[] }> {
  const states: Partial<Record<Id, boolean>> = {};
  const timedOut: Id[] = [];
  await Promise.all(
    ids.map(async (id) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), opts.timeoutMs);
      });
      const res = await Promise.race([check(id).catch(() => false), limit]);
      clearTimeout(timer);
      if (res === 'timeout') {
        timedOut.push(id);
        return;
      }
      states[id] = res;
      opts.onResult?.(id, res);
    })
  );
  return { states, timedOut };
}
