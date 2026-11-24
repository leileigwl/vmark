import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../ui';

interface SectionCardProps {
  id: string;
  title: string;
  /** 收起时右侧的一句话：沿用通用 / 差几项 / 几张卡片。 */
  summary: string;
  warn?: boolean;
  children: ReactNode;
}

/** 平台专属分区：默认收起，只露一行标题和一句话状态；点开再看细节。 */
export function SectionCard({ id, title, summary, warn, children }: SectionCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[var(--radius-card)] border border-line" data-testid={`section-${id}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-card)] px-4 text-left hover:bg-hover/50"
      >
        <span className="shrink-0 text-[13px] font-medium text-ink">{title}</span>
        <span className={cn('min-w-0 flex-1 truncate text-xs', warn ? 'text-warning' : 'text-muted')}>{summary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? <div className="space-y-5 border-t border-line px-4 pb-5 pt-4">{children}</div> : null}
    </section>
  );
}
