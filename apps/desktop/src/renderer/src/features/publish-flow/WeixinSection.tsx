import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../ui';
import { previewSrc } from './coverCrop';
import { FocusImage, useImageUpload } from './CoverField';
import { coverFocusFor, coverFor, type Issue, type PublishDraft } from './draftModel';
import { RATIO_VALUE, SPEC_BY_ID, coverGuide } from './platformSpecs';
import { SectionCard } from './SectionCard';
import { WeixinPreview } from './WeixinPreview';

interface WeixinSectionProps {
  draft: PublishDraft;
  markdown: string;
  bodyImage: string;
  issues: Issue[];
  onChange: (patch: Partial<PublishDraft> | ((d: PublishDraft) => Partial<PublishDraft>)) => void;
}

/**
 * 公众号块：只放刷到文章的人能看到的封面——上传入口、列表大图 2.35:1 + 转发小图 1:1 的焦点裁切预览，
 * 以及排版预览。标题、摘要、标签沿用通用内容（超限时在「需要单独处理」里改）。
 */
export function WeixinSection({ draft, markdown, bodyImage, issues, onChange }: WeixinSectionProps) {
  const spec = SPEC_BY_ID.weixin!;
  const guide = coverGuide(spec, bodyImage);
  const cover = coverFor(draft, spec, bodyImage);
  const own = draft.weixin.cover;
  const src = cover && (cover.kind === 'upload' || cover.kind === 'body') ? cover.src : '';
  const focus = cover?.kind === 'upload' ? coverFocusFor(draft, spec) : { x: 50, y: 50 };
  const fileRef = useRef<HTMLInputElement>(null);
  const setWeixin = (patch: Partial<PublishDraft['weixin']>) => onChange((d) => ({ weixin: { ...d.weixin, ...patch } }));
  const { upload, error, busy } = useImageUpload((path) => setWeixin({ cover: path, focus: { x: 50, y: 50 } }), fileRef);
  const source = own ? '公众号单独上传' : draft.coverUpload ? '沿用通用封面' : src ? '用正文首图自动裁' : '正文没有图片，请上传一张封面';
  const summary = issues.length ? issues.map((i) => i.message).join(' · ') : `封面：${source} · 点开看裁切与排版`;

  return (
    <SectionCard id="weixin" title="公众号" summary={summary} warn={issues.length > 0}>
      <div className="space-y-3" data-testid="weixin-cover">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-ink">封面</div>
            <p className="mt-0.5 text-[11px] text-muted">
              {guide?.slots.map((s) => `${s.label} ${s.ratio}`).join(' + ')} · {source}
              {own ? ' · 点图片设置焦点' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {own ? (
              <Button variant="ghost" className="h-9" onClick={() => setWeixin({ cover: '' })}>
                移除
              </Button>
            ) : null}
            <Button className="h-9" loading={busy} onClick={() => fileRef.current?.click()}>
              {!busy ? <ImagePlus /> : null}
              {own ? '更换' : '上传公众号封面'}
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="weixin-cover-input" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {src ? (
          <div className="flex flex-wrap items-end gap-4">
            {own ? <FocusImage src={own} focus={draft.weixin.focus} onFocus={(f) => setWeixin({ focus: f })} className="h-20" /> : null}
            {guide?.slots.map(({ ratio, label }) => (
              <figure key={ratio} className="space-y-1">
                <div className="h-20 overflow-hidden rounded-md border border-line bg-hover" style={{ aspectRatio: String(RATIO_VALUE[ratio]) }}>
                  <img src={previewSrc(src)} alt={`${ratio} 封面预览`} className="size-full object-cover" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
                </div>
                <figcaption className="text-[11px] text-muted">
                  {label} {ratio}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </div>
      <WeixinPreview markdown={markdown} />
    </SectionCard>
  );
}
