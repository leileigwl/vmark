import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const fieldBase =
  'w-full rounded-[var(--radius-ui)] border border-line bg-canvas px-2.5 text-[13px] text-ink placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, 'h-8', className)} {...props} />
);
Input.displayName = 'Input';

/** 多行输入：不能拖动大小，高度随内容增长（最低 72px，最高 240px），再多就在框内滚动。 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldBase, 'min-h-[72px] max-h-60 resize-none overflow-y-auto py-2 leading-relaxed [field-sizing:content]', className)}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

interface FieldProps {
  label: string;
  htmlFor?: string;
  /** 右上角计数，如 12/64；超限时标红。 */
  count?: { value: number; max?: number; min?: number };
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** 表单字段：标签 + 计数 + 控件 + 提示/错误。 */
export function Field({ label, htmlFor, count, hint, error, required, children, className }: FieldProps) {
  const over = count && ((count.max !== undefined && count.value > count.max) || (count.min !== undefined && count.value > 0 && count.value < count.min));
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
        {count ? (
          <span className={cn('text-[11px] tabular-nums', over ? 'text-danger' : 'text-muted')}>
            {count.value}
            {count.max !== undefined ? ` / ${count.max}` : ''}
          </span>
        ) : null}
      </div>
      {children}
      {error ? <p className="text-[11px] text-danger">{error}</p> : hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
