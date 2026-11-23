/**
 * 主进程账号检测只有一个入口：心跳、窗口聚焦、渲染层「刷新」同时触发时复用同一次检测，
 * 所有界面拿到的是同一份结果（不会一处「已授权」、另一处还在「检测中」）。
 */
export function createSharedCheck<T>(run: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) {
      inflight = run().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}
