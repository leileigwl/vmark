import { useState, type RefObject } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button, Tooltip, cn } from '../../ui';
import { importLocalImage, previewSrc } from './coverCrop';
import { COVER_RATIO_HINT, RATIO_VALUE, coverGuideLines, type CoverRatio, type PlatformSpec } from './platformSpecs';
import type { PublishDraft } from './draftModel';

interface CoverFieldProps {
  draft: PublishDraft;
  /** 已勾选且有封面项的平台。 */
  specs: PlatformSpec[];
  bodyImage: string;
  onChange: (patch: Partial<PublishDraft>) => void;
  /** 文件选择框；“需要单独处理”里的上传按钮也用它。 */
  inputRef: RefObject<HTMLInputElement>;
}

/** 没上传时逐个列出已勾选平台：要不要封面、什么比例、不传会怎样（同一用法的平台合成一行）。 */
function CoverGuideList({ specs, bodyImage }: { specs: PlatformSpec[]; bodyImage: string }) {
  const lines = coverGuideLines(specs, bodyImage);
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted" data-testid="cover-guide">
      {lines.map((l) => (
        <li key={l.mode} data-testid={`cover-guide-${l.mode}`} className="leading-5">
          <span className="text-ink">{l.names.join('、')}</span>：
          <span className={cn(l.required && 'font-medium text-ink')}>{l.required ? '必需' : '可选'}</span>
          {' · '}
          {l.slots.map((s, i) => (
            <span key={s.ratio}>
              {i ? ' + ' : ''}
              {s.label ? `${s.label} ` : ''}
              <Tooltip content={COVER_RATIO_HINT}>
                <span className="cursor-help underline decoration-dotted underline-offset-2" data-testid="cover-ratio">
                  {s.ratio}
                </span>
              </Tooltip>
            </span>
          ))}
          {' · '}
          {l.fallback}
          {l.needUpload ? <span className="ml-1 font-medium text-danger">正文无图，需上传</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** 封面：唯一入口“上传封面”。上传后点图设焦点，按焦点生成各平台需要的比例。 */
export function CoverField({ draft, specs, bodyImage, onChange, inputRef: fileRef }: CoverFieldProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const src = draft.coverUpload;

  const ratios = new Map<CoverRatio, string[]>();
  for (const s of specs) for (const r of s.cover?.ratios ?? []) ratios.set(r, [...(ratios.get(r) ?? []), s.short]);

  const upload = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange({ coverUpload: await importLocalImage(file), coverFocus: { x: 50, y: 50 } });
    } catch (e) {
      setError(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3" data-testid="cover-field">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink">封面</div>
          {!src ? <CoverGuideList specs={specs} bodyImage={bodyImage} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {src ? (
            <Button variant="ghost" className="h-9" onClick={() => onChange({ coverUpload: '' })}>
              移除
            </Button>
          ) : null}
          <Button className="h-9" loading={busy} onClick={() => fileRef.current?.click()}>
            {!busy ? <ImagePlus /> : null}
            {src ? '更换' : '上传封面'}
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="cover-input" onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {src ? (
        <div className="flex items-start gap-4">
          <Tooltip content="点图片设置焦点，各比例以焦点为中心裁切">
            <div
              className="relative h-32 shrink-0 cursor-crosshair overflow-hidden rounded-md border border-line bg-hover"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.round(((e.clientX - r.left) / r.width) * 100);
                const y = Math.round(((e.clientY - r.top) / r.height) * 100);
                onChange({ coverFocus: { x, y } });
              }}
            >
              <img src={previewSrc(src)} alt="上传的封面" className="h-full w-auto max-w-[220px] object-contain" />
              <span
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
                style={{ left: `${draft.coverFocus.x}%`, top: `${draft.coverFocus.y}%` }}
              />
            </div>
          </Tooltip>
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            {[...ratios.entries()].map(([ratio, names]) => (
              <figure key={ratio} className="space-y-1">
                <div className="h-20 overflow-hidden rounded-md border border-line bg-hover" style={{ aspectRatio: String(RATIO_VALUE[ratio]) }}>
                  <img
                    src={previewSrc(src)}
                    alt={`${ratio} 封面预览`}
                    className="size-full object-cover"
                    style={{ objectPosition: `${draft.coverFocus.x}% ${draft.coverFocus.y}%` }}
                  />
                </div>
                <figcaption className="max-w-[140px] truncate text-[11px] text-muted" title={names.join('、')}>
                  {ratio} · {names.join('、')}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
