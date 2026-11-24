import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../ui';

export interface CategoryOption {
  id: string;
  name: string;
}

/**
 * 单选分类：一行可换行的选项片，默认不预选。键盘：Tab 进入当前项，方向键切换。
 * 选项少（掘金 8 个），直接平铺比下拉少一次点击。
 */
export function CategoryPicker({ label, options, value, onChange }: { label: string; options: readonly CategoryOption[]; value: string; onChange: (id: string) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex((o) => o.id === value));
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o, i) => {
          const checked = o.id === value;
          return (
            <button
              key={o.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === current ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                checked ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-line text-ink hover:bg-hover'
              )}
            >
              {checked ? <Check className="size-3.5" aria-hidden /> : null}
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
