import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from './cn';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-line bg-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3 text-white" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
