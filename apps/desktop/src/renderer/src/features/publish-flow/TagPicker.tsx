import { Check } from 'lucide-react';
import { cn } from '../../ui';

interface TagPickerProps {
  label: string;
  /** 可选的标签（通用标签，加上之前挑过但已不在通用标签里的）。 */
  options: string[];
  value: string[];
  max: number;
  hint?: string;
  onChange: (tags: string[]) => void;
}

/** 平台标签有个数上限时，从通用标签里挑出该平台用的几个；选满后其余项禁用。顺序保持通用标签的顺序。 */
export function TagPicker({ label, options, value, max, hint, onChange }: TagPickerProps) {
  const full = value.length >= max;
  const toggle = (tag: string) => {
    const next = value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag];
    onChange(options.filter((o) => next.includes(o)));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="text-[11px] tabular-nums text-muted">
          {value.length} / {max}
        </span>
      </div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((tag) => {
          const checked = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={!checked && full}
              onClick={() => toggle(tag)}
              className={cn(
                'inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50',
                checked ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-line text-ink hover:bg-hover'
              )}
            >
              {checked ? <Check className="size-3.5" aria-hidden /> : null}
              {tag}
            </button>
          );
        })}
      </div>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
