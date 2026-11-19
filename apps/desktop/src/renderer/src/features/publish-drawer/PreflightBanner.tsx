import { PLATFORM_CATALOG } from '@vcat/adapters';
import type { PlatformId } from '@vcat/shared';

interface PreflightBannerProps {
  faultyPlatforms: PlatformId[];
  healthyCount: number;
  disabled: boolean;
  onExcludeAndPublish: () => void;
  onDismiss: () => void;
}

/** Pre-flight authorization check warning banner for multi-platform batch publish. */
export function PreflightBanner({
  faultyPlatforms,
  healthyCount,
  disabled,
  onExcludeAndPublish,
  onDismiss,
}: PreflightBannerProps) {
  return (
    <div className="rounded-lg border border-[#cf222e] bg-[#ffebe9] p-3 text-xs text-[#cf222e]">
      <div className="font-semibold">
        ⚠️ 前置强校验拦截：检测到以下已勾选平台尚未完成授权登录
      </div>
      <div className="mt-1 text-[11px] text-[#24292f]">
        已拦截本次分发，防止出现「部分平台成功、部分平台失败」的不一致脏状态：
        <span className="ml-1 font-medium text-[#cf222e]">
          {faultyPlatforms
            .map((id) => PLATFORM_CATALOG.find((p) => p.id === id)?.name || id)
            .join('、')}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={healthyCount === 0 || disabled}
          onClick={onExcludeAndPublish}
          className="rounded bg-[#cf222e] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          一键排除故障平台，继续发布健康平台 ({healthyCount})
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-[#cf222e]/30 bg-white px-2 py-1 text-[11px] text-[#24292f] hover:bg-[#f6f8fa]"
        >
          暂缓发布，先去授权
        </button>
      </div>
    </div>
  );
}
