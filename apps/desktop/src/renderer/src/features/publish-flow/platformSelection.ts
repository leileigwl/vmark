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
