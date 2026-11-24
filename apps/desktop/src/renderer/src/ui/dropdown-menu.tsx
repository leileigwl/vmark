import type { ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn } from './cn';

export interface MenuItemDef {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

/** “⋯”更多菜单：放不常用和危险操作，键盘可用。 */
export function MoreMenu({ items, label = '更多操作', trigger }: { items: MenuItemDef[]; label?: string; trigger?: ReactNode }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-7 items-center justify-center rounded-[var(--radius-ui)] text-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={4}
          className="z-[60] min-w-[160px] rounded-[var(--radius-ui)] border border-line bg-canvas p-1 text-[13px] shadow-lg"
        >
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover [&_svg]:size-3.5',
                item.danger ? 'text-danger' : 'text-ink'
              )}
            >
              {item.icon}
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
