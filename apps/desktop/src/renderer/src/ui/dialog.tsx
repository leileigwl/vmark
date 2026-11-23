import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** 标题栏右侧的额外内容。 */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 模态对话框：焦点锁定、Esc 关闭、点遮罩关闭。 */
export function Dialog({ open, onOpenChange, title, description, headerExtra, footer, children, className }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-modal="true"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[920px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-canvas text-ink shadow-2xl focus:outline-none',
            className
          )}
        >
          <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-[15px] font-semibold">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 truncate text-xs text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">对话框</DialogPrimitive.Description>
              )}
            </div>
            {headerExtra}
            <DialogPrimitive.Close
              aria-label="关闭"
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-ui)] text-muted hover:bg-hover hover:text-ink"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          {footer ? <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
