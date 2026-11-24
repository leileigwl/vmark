import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../ui';

/** 标签输入：回车或逗号添加，退格删除最后一个。 */
export function TagInput({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(/[,，\s]/).map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setText('');
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-[var(--radius-ui)] border border-line bg-canvas px-1.5 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded bg-hover px-1.5 py-0.5 text-xs text-ink">
          {t}
          <button type="button" aria-label={`删除标签 ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-ink">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? '' : placeholder}
        className={cn('h-6 min-w-[80px] flex-1 bg-transparent px-1 text-[13px] text-ink outline-none placeholder:text-muted/70')}
      />
    </div>
  );
}
