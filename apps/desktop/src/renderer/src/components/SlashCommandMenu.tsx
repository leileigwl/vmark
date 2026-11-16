import type { SlashCommandItem } from '../editor/slashCommands';

interface SlashCommandMenuProps {
  open: boolean;
  x: number;
  y: number;
  query: string;
  items: SlashCommandItem[];
  selectedIndex: number;
  onHoverIndex: (idx: number) => void;
  onSelect: (item: SlashCommandItem) => void;
}

/** Floating Typora-style slash command menu supporting Chinese, pinyin, and English filtering. */
export function SlashCommandMenu({
  open,
  x,
  y,
  query,
  items,
  selectedIndex,
  onHoverIndex,
  onSelect,
}: SlashCommandMenuProps) {
  if (!open) return null;

  const clampedTop = Math.min(y, window.innerHeight - 310);
  const clampedLeft = Math.min(Math.max(12, x), window.innerWidth - 270);

  return (
    <div
      style={{ top: `${Math.max(44, clampedTop)}px`, left: `${clampedLeft}px` }}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 w-[256px] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]/98 py-1.5 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 pb-1 text-[11px] text-[var(--control-text-color)]">
        <span>斜杠命令 {query ? `/${query}` : ''}</span>
        <span>↑↓ · Enter</span>
      </div>
      <div className="max-h-[260px] overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--control-text-color)]">无匹配命令</div>
        ) : (
          items.map((item, idx) => {
            const active = idx === selectedIndex;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelect(item)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] ${
                  active
                    ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                    : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.label}</div>
                  <div className="truncate text-[10.5px] opacity-65">{item.description}</div>
                </div>
                {item.shortcut && (
                  <span className="ml-2 shrink-0 text-[10.5px] text-[var(--control-text-color)]">
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
