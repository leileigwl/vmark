import { previewSrc } from './coverCrop';
import { coverFocusFor, coverFor, ownCoverOf, type Issue, type PublishDraft } from './draftModel';
import { RATIO_VALUE, SPEC_BY_ID, coverGuide } from './platformSpecs';
import { SectionCard } from './SectionCard';
import { WeixinPreview } from './WeixinPreview';

interface WeixinSectionProps {
  draft: PublishDraft;
  markdown: string;
  bodyImage: string;
  issues: Issue[];
}

/**
 * 公众号块：只看封面裁剪比例——通用封面（没传就用正文首图）按列表大图 2.35:1 + 转发小图 1:1 裁切的预览，
 * 以及排版预览。标题、摘要、标签、封面都用通用内容（超限时在「需要单独处理」里改）。
 */
export function WeixinSection({ draft, markdown, bodyImage, issues }: WeixinSectionProps) {
  const spec = SPEC_BY_ID.weixin!;
  const guide = coverGuide(spec, bodyImage);
  const cover = coverFor(draft, spec, bodyImage);
  const src = cover && (cover.kind === 'upload' || cover.kind === 'body') ? cover.src : '';
  const focus = cover?.kind === 'upload' ? coverFocusFor(draft, spec) : { x: 50, y: 50 };
  const source = ownCoverOf(draft, spec) ? '用公众号单独封面裁' : draft.coverUpload ? '用通用封面按焦点裁' : src ? '用正文首图自动裁' : '正文没有图片，请上传一张封面（在上方通用内容里）';
  const summary = issues.length ? issues.map((i) => i.message).join(' · ') : `封面：${source} · 点开看裁切与排版`;

  return (
    <SectionCard id="weixin" title="公众号" summary={summary} warn={issues.length > 0}>
      <div className="space-y-3" data-testid="weixin-cover">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink">封面裁剪</div>
          <p className="mt-0.5 text-[11px] text-muted">
            {guide?.slots.map((s) => `${s.label} ${s.ratio}`).join(' + ')} · {source}
          </p>
        </div>
        {src ? (
          <div className="flex flex-wrap items-end gap-4">
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
