import { useState, type RefObject } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button, Tooltip } from '../../ui';
import { importLocalImage, previewSrc } from './coverCrop';
import type { PublishDraft } from './draftModel';

/** 上传的封面缩略图，点图设焦点（各比例以焦点为中心裁切）。 */
export function FocusImage({ src, focus, onFocus, className = 'h-24' }: { src: string; focus: { x: number; y: number }; onFocus: (f: { x: number; y: number }) => void; className?: string }) {
  return (
    <Tooltip content="点图片设置焦点，各比例以焦点为中心裁切">
      <div
        className={`relative shrink-0 cursor-crosshair overflow-hidden rounded-md border border-line bg-hover ${className}`}
        data-testid="cover-focus"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onFocus({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
        }}
      >
        <img src={previewSrc(src)} alt="上传的封面" className="h-full w-auto max-w-[200px] object-contain" />
        <span
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
          style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
        />
      </div>
    </Tooltip>
  );
}

/** 选图并存进工作区；返回上传函数与状态。 */
export function useImageUpload(onDone: (path: string) => void, inputRef: RefObject<HTMLInputElement>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onDone(await importLocalImage(file));
    } catch (e) {
      setError(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return { upload, error, busy };
}

interface CoverFieldProps {
  draft: PublishDraft;
  /** 一句短提示，如「其他平台按需自动裁 16:9」（来自 platformSpecs）。 */
  hint: string | null;
  onChange: (patch: Partial<PublishDraft>) => void;
  /** 文件选择框；“需要单独处理”里的上传按钮也用它。 */
  inputRef: RefObject<HTMLInputElement>;
}

/** 通用封面：一张图铺给所有平台。只有上传按钮、缩略图和一句提示，不再逐平台列规则。 */
export function CoverField({ draft, hint, onChange, inputRef }: CoverFieldProps) {
  const src = draft.coverUpload;
  const { upload, error, busy } = useImageUpload((path) => onChange({ coverUpload: path, coverFocus: { x: 50, y: 50 } }), inputRef);
  return (
    <div className="space-y-2" data-testid="cover-field">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink">封面</div>
          <p className="mt-0.5 text-[11px] text-muted" data-testid="cover-hint">
            {src ? '点图片设置焦点' : hint ?? '不上传则各平台用默认封面'}
            {src && hint ? ` · ${hint}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {src ? (
            <Button variant="ghost" className="h-9" onClick={() => onChange({ coverUpload: '' })}>
              移除
            </Button>
          ) : null}
          <Button className="h-9" loading={busy} onClick={() => inputRef.current?.click()}>
            {!busy ? <ImagePlus /> : null}
            {src ? '更换' : '上传封面'}
          </Button>
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="cover-input" onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {src ? <FocusImage src={src} focus={draft.coverFocus} onFocus={(coverFocus) => onChange({ coverFocus })} /> : null}
    </div>
  );
}
