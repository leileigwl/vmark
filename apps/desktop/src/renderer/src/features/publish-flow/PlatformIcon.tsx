import type { PlatformId } from '@vcat/shared';
import { PLATFORM_LINKS } from '../platform-auth';
import { cn } from '../../ui';

/** 平台品牌方块图标（颜色来自平台品牌色，属于数据而非主题色）。 */
export function PlatformIcon({ id, size = 'md' }: { id: PlatformId; size?: 'sm' | 'md' }) {
  const link = PLATFORM_LINKS[id];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white ring-1 ring-inset ring-white/15',
        size === 'sm' ? 'size-5 text-[10px]' : 'size-7 text-xs'
      )}
      style={{ backgroundColor: link?.color ?? 'var(--control-text-color)' }}
    >
      {link?.short ?? id.slice(0, 1).toUpperCase()}
    </span>
  );
}
