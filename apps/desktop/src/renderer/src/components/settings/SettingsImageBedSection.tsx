import type { ImageBedConfig } from '@vcat/shared';

interface SettingsImageBedSectionProps {
  imageBed: ImageBedConfig;
  imageBedTestMsg: string;
  onUpdateImageBed: (next: ImageBedConfig, persist?: boolean) => void;
  onTestImageBed: () => void;
}

/** Image insertion scale & official platform image upload panel. */
export function SettingsImageBedSection({
  imageBed,
  onUpdateImageBed,
}: SettingsImageBedSectionProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold">插入图片时</h2>
        <p className="mt-1 text-xs text-[var(--control-text-color)]">
          本地写作始终保存至 <code>./assets/</code>，离线完全可用。
        </p>
      </div>

      <div className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-[13px]">
        <div className="mb-2 font-medium">默认图片显示比例</div>
        <div className="flex flex-wrap gap-2">
          {([50, 75, 100] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => onUpdateImageBed({ ...imageBed, defaultImageScale: scale }, true)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                (imageBed.defaultImageScale ?? 50) === scale
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {scale}%{scale === 50 ? '（默认推荐）' : scale === 100 ? '（原宽）' : ''}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-[var(--control-text-color)]">
          点击正文图片后可使用鼠标滚轮直接平滑放大/缩小（15% ~ 100%）。
        </div>
      </div>

      <div className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-[13px]">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            className="mt-1 accent-[var(--accent)]"
            checked
            onChange={() => onUpdateImageBed({ ...imageBed, strategy: 'platform_private' }, true)}
          />
          <div>
            <div className="font-medium">分发时直传目标平台官方图床（默认推荐）</div>
            <div className="mt-0.5 text-xs text-[var(--control-text-color)]">
              推送公众号 / 知乎 / CSDN / 百家号 / 小红书等平台时直接上传至平台官方素材库，无需额外配置外部云图床。
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
