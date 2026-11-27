import { existsSync, readdirSync } from 'node:fs';

const DUPLICATE_MAC_APP_RE = /^vmark(?:\s+\d+|\s+\(\d+\)|\s+副本(?:\s*\d*)?)\.app$/i;

/** 检测 `/Applications` 下是否存在除 `Vmark.app` 之外的重复安装副本（例如 `Vmark 2.app`）。 */
export function findDuplicateMacApps(applicationsDir = '/Applications'): string[] {
  try {
    if (!existsSync(applicationsDir)) return [];
    return readdirSync(applicationsDir)
      .filter((name) => name.toLowerCase() !== 'vmark.app' && DUPLICATE_MAC_APP_RE.test(name))
      .sort();
  } catch {
    return [];
  }
}
