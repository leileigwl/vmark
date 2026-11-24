import { useEffect, useState } from 'react';
import { JUEJIN_CATEGORIES } from '@vcat/adapters';
import type { CategoryOption } from './CategoryPicker';

const RENDERER_TIMEOUT_MS = 4000;

/**
 * 异步加载掘金分类；初始立即可用内置列表，拉取失败或超时时保持内置列表不阻塞发布。
 */
export function useJuejinCategories(enabled: boolean): readonly CategoryOption[] {
  const [options, setOptions] = useState<readonly CategoryOption[]>(JUEJIN_CATEGORIES);

  useEffect(() => {
    if (!enabled) return;
    const loader = window.electronAPI?.listJuejinCategories;
    if (!loader) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), RENDERER_TIMEOUT_MS);
    });

    void Promise.race([loader().catch(() => null), timeout])
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setOptions(list);
        }
      })
      .finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled]);

  return options;
}
