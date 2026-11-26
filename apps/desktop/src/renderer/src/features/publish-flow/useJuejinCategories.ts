import { useEffect, useState } from 'react';
import { JUEJIN_CATEGORIES } from '@vcat/adapters';
import type { CategoryOption } from './CategoryPicker';

const RENDERER_TIMEOUT_MS = 4000;

export interface JuejinCategoryList {
  options: readonly CategoryOption[];
  /** 掘金已勾选且拉取已结束（成功、失败或超时，或没有拉取接口）：此时 options 就是最终可选列表。 */
  settled: boolean;
}

/**
 * 异步加载掘金分类；初始立即可用内置列表，拉取失败或超时时保持内置列表不阻塞发布。
 * 只拉取一次：取消勾选掘金再勾回来沿用上次结果。
 */
export function useJuejinCategories(enabled: boolean): JuejinCategoryList {
  const [options, setOptions] = useState<readonly CategoryOption[]>(JUEJIN_CATEGORIES);
  const [attempted, setAttempted] = useState(false);
  const hasLoader = Boolean(window.electronAPI?.listJuejinCategories);

  useEffect(() => {
    if (!enabled || attempted) return;
    const load = window.electronAPI?.listJuejinCategories;
    if (!load) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), RENDERER_TIMEOUT_MS);
    });

    void Promise.race([load().catch(() => null), timeout])
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setOptions(list);
        }
      })
      .finally(() => {
        if (timer !== undefined) clearTimeout(timer);
        if (!cancelled) setAttempted(true);
      });

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled, attempted]);

  return { options, settled: enabled && (!hasLoader || attempted) };
}
