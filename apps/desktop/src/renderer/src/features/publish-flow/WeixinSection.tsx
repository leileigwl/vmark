import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../ui';
import { FocusImage, useImageUpload } from './CoverField';
import { previewSrc } from './coverCrop';
import { coverFocusFor, coverFor, ownCoverOf, setOwnCover, type Issue, type PublishDraft } from './draftModel';
import { SPEC_BY_ID } from './platformSpecs';
import { SectionCard } from './SectionCard';

interface WeixinSectionProps {
  draft: PublishDraft;
  bodyImage: string;
  issues: Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/**
 * 公众号块：单行对齐的封面设置（可选单独上传 / 复用通用封面或正文首图）+ FocusImage 预览（点图设焦点）。
 */
export function WeixinSection({ draft, bodyImage, issues, onChange }: WeixinSectionProps) {
  const spec = SPEC_BY_ID.weixin!;
  const fileRef = useRef<HTMLInputElement>(null);

  const own = ownCoverOf(draft, spec);
  const cover = coverFor(draft, spec, bodyImage);
  const src = cover && (cover.kind === 'upload' || cover.kind === 'body') ? cover.src : '';
  const focus = cover?.kind === 'upload' ? coverFocusFor(draft, spec) : { x: 50, y: 50 };

  const set = (nextCover: string, nextFocus?: { x: number; y: number }) =>
    onChange((d) => ({ ownCovers: setOwnCover(d, spec.id, nextCover, nextFocus) }));
  const { upload, error, busy } = useImageUpload((path) => set(path), fileRef);

  const source = own
    ? '使用单独封面'
    : draft.coverUpload
      ? '使用通用封面'
      : src
        ? '使用正文首图'
        : '请上传一张封面（推荐 2.35:1，900×383）';
  const subtitle = src ? `${source} · 推荐 2.35:1（900×383）` : source;
  const summary = issues.length ? issues.map((i) => i.message).join(' · ') : source;

  return (
    <SectionCard id="weixin" title="公众号" summary={summary} warn={issues.length > 0}>
      <div className="space-y-3" data-testid="weixin-cover">
        <div className="flex items-center justify-between gap-4" data-testid={own ? 'own-cover-weixin' : undefined}>
          <div className="min-w-0">
            <div className="text-xs font-medium text-ink">单独封面（可选）</div>
            <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {own ? (
              <Button variant="ghost" className="h-9" onClick={() => set('')}>
                移除
              </Button>
            ) : null}
            <Button className="h-9" loading={busy} onClick={() => fileRef.current?.click()}>
              {!busy ? <ImagePlus /> : null}
              {own ? '更换' : '上传图片'}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            data-testid="own-cover-input-weixin"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {cover?.kind === 'upload' ? (
          <FocusImage
            src={src}
            focus={focus}
            onFocus={(nextFocus) => {
              if (own) set(own.cover, nextFocus);
              else onChange({ coverFocus: nextFocus });
            }}
          />
        ) : src ? (
          <img src={previewSrc(src)} alt="上传的封面" className="h-24 w-auto max-w-[200px] rounded-md border border-line bg-hover object-contain" />
        ) : null}
      </div>
    </SectionCard>
  );
}
