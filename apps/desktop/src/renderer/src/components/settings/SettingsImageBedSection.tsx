import type { ImageBedConfig } from '@vcat/shared';

interface SettingsImageBedSectionProps {
  imageBed: ImageBedConfig;
  imageBedTestMsg: string;
  onUpdateImageBed: (next: ImageBedConfig, persist?: boolean) => void;
  onTestImageBed: () => void;
}

/** Image insertion scale & multi-provider image bed configuration panel. */
export function SettingsImageBedSection({
  imageBed,
  imageBedTestMsg,
  onUpdateImageBed,
  onTestImageBed,
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

      <div className="space-y-3 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-[13px]">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            className="mt-1"
            checked={imageBed.strategy === 'platform_private'}
            onChange={() => onUpdateImageBed({ ...imageBed, strategy: 'platform_private' }, true)}
          />
          <div>
            <div className="font-medium">分发时直传目标平台官方图床（推荐）</div>
            <div className="text-xs text-[var(--control-text-color)]">
              推送公众号/博客园/CSDN 时自动上传为官方素材，彻底免疫跨平台防盗链
            </div>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            className="mt-1"
            checked={imageBed.strategy === 'custom_oss'}
            onChange={() => onUpdateImageBed({ ...imageBed, strategy: 'custom_oss' }, true)}
          />
          <div>
            <div className="font-medium">上传至通用云图床（PicGo-Core / 全平台对象存储）</div>
            <div className="text-xs text-[var(--control-text-color)]">
              支持 PicGo-Core、阿里云 OSS、腾讯云 COS、AWS S3 / R2、GitHub、七牛云、SM.MS、Imgur
            </div>
          </div>
        </label>

        {imageBed.strategy === 'custom_oss' && (
          <div className="mt-3 space-y-3 border-t border-[var(--border-color)] pt-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['picgo_core', 'PicGo-Core'],
                  ['aliyun_oss', '阿里云 OSS'],
                  ['tencent_cos', '腾讯云 COS'],
                  ['s3', 'AWS S3 / R2'],
                  ['github', 'GitHub'],
                  ['qiniu', '七牛云'],
                  ['smms', 'SM.MS'],
                  ['imgur', 'Imgur'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onUpdateImageBed({ ...imageBed, provider: id })}
                  className={`rounded border px-2 py-1.5 text-center font-medium ${
                    (imageBed.provider ?? 'picgo_core') === id
                      ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-main)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(imageBed.provider ?? 'picgo_core') === 'picgo_core' && (
              <input
                type="text"
                placeholder="PicGo-Core 可执行路径（默认 picgo）"
                value={imageBed.picgoPath ?? ''}
                onChange={(e) => onUpdateImageBed({ ...imageBed, picgoPath: e.target.value })}
                className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
              />
            )}

            {imageBed.provider === 'github' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="GitHub 仓库 (如 user/images)"
                  value={imageBed.repo ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, repo: e.target.value })}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="text"
                  placeholder="分支 (默认 main)"
                  value={imageBed.branch ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, branch: e.target.value })}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="password"
                  placeholder="Personal Access Token"
                  value={imageBed.token ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, token: e.target.value })}
                  className="sm:col-span-2 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}

            {(imageBed.provider === 'smms' || imageBed.provider === 'imgur') && (
              <input
                type="password"
                placeholder="API Token / Client ID"
                value={imageBed.token ?? ''}
                onChange={(e) => onUpdateImageBed({ ...imageBed, token: e.target.value })}
                className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
              />
            )}

            {(imageBed.provider === 'aliyun_oss' ||
              imageBed.provider === 'tencent_cos' ||
              imageBed.provider === 's3' ||
              imageBed.provider === 'qiniu') && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Bucket 名称"
                  value={imageBed.bucket ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, bucket: e.target.value })}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="text"
                  placeholder="Region / Endpoint"
                  value={imageBed.region ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, region: e.target.value })}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="text"
                  placeholder="AccessKey"
                  value={imageBed.accessKey ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, accessKey: e.target.value })}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="password"
                  placeholder="SecretKey"
                  value={imageBed.secretKey ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, secretKey: e.target.value })}
                  className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="text"
                  placeholder="自定义加速域名 (可选)"
                  value={imageBed.customDomain ?? ''}
                  onChange={(e) => onUpdateImageBed({ ...imageBed, customDomain: e.target.value })}
                  className="sm:col-span-2 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onUpdateImageBed(imageBed, true)}
                className="rounded bg-[var(--accent)] px-3 py-1 text-white hover:opacity-90"
              >
                保存配置
              </button>
              <button
                type="button"
                onClick={onTestImageBed}
                className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-1 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                测试图床连通性
              </button>
              {imageBedTestMsg && (
                <span className="text-[11px] text-[var(--accent)]">{imageBedTestMsg}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
