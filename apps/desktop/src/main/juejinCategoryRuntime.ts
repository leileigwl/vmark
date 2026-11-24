import { JUEJIN_CATEGORIES } from '@vcat/adapters';
import type { JuejinCategoryItem } from '@vcat/shared';

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * 运行时拉取掘金文章分类；接口报错、返回空或超时时退回内置 JUEJIN_CATEGORIES。
 */
export async function fetchJuejinCategories(
  fetcher?: () => Promise<JuejinCategoryItem[]>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<JuejinCategoryItem[]> {
  const load =
    fetcher ??
    (async () => {
      const { JuejinAdapter } = await import('@vcat/adapters');
      return new JuejinAdapter().listCategories();
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const result = await Promise.race([
      load().catch(() => null),
      timeout,
    ]);
    if (Array.isArray(result) && result.length > 0) {
      return result;
    }
    return [...JUEJIN_CATEGORIES];
  } catch {
    return [...JUEJIN_CATEGORIES];
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
