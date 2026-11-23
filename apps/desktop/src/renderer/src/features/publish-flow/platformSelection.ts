import type { PlatformId } from '@vcat/shared';
import { PLATFORM_SPECS } from './platformSpecs.ts';

/**
 * 「全选可推送」：勾上所有已登录、进草稿箱的平台；未登录 / 检测中 / 检测失败的不勾（推不出去的也取消）。
 * GitHub 博客推送后直接上线，不由一键全选替用户勾上；用户自己勾过的保留。
 */
export function selectPushable(current: PlatformId[], statusOf: (id: PlatformId) => string): PlatformId[] {
  return PLATFORM_SPECS.filter((s) => (s.kind === 'site' ? current.includes(s.id) : statusOf(s.id) === 'signedIn'))
    .sort((a, b) => Number(a.kind === 'site') - Number(b.kind === 'site'))
    .map((s) => s.id);
}

/** 已登录的草稿平台都已勾上（至少一个）＝「已全选」，按钮显示「取消全选」。GitHub 博客不计入。 */
export function allPushableSelected(current: PlatformId[], statusOf: (id: PlatformId) => string): boolean {
  const pushable = PLATFORM_SPECS.filter((s) => s.kind !== 'site' && statusOf(s.id) === 'signedIn');
  return pushable.length > 0 && pushable.every((s) => current.includes(s.id));
}

/** 切换：没全选时＝全选可推送；已全选时＝全部取消。 */
export function togglePushable(current: PlatformId[], statusOf: (id: PlatformId) => string): PlatformId[] {
  return allPushableSelected(current, statusOf) ? [] : selectPushable(current, statusOf);
}
