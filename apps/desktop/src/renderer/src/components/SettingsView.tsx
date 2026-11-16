import { FileText, GitBranch, Globe, Image as ImageIcon, Palette } from 'lucide-react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import type { GitStatusInfo, ImageBedConfig, PlatformId, StartupConfig, StartupMode, ThemeId } from '@vcat/shared';

export type SettingCategory = 'startup' | 'image' | 'theme' | 'platforms' | 'github';

const THEME_ITEMS: Array<{ id: ThemeId; name: string; desc: string }> = [
  { id: 'apple-light', name: 'Apple Light（默认）', desc: 'SF Pro · 系统蓝' },
  { id: 'typora-white', name: 'Typora White', desc: '经典 GitHub 纯白' },
  { id: 'bloom-lapis', name: 'Bloom Lapis', desc: '文档蓝 · 护眼浅蓝' },
  { id: 'bloom-lapis-dark', name: 'Bloom Lapis Dark', desc: '文档蓝 · 深邃夜蓝' },
  { id: 'bloom-wheat', name: 'Bloom Wheat', desc: '象牙纸张 · 暖白' },
  { id: 'bloom-wheat-dark', name: 'Bloom Wheat Dark', desc: '象牙暖棕 · 暗色' },
  { id: 'bloom-amber', name: 'Bloom Amber', desc: '琥珀暖光' },
  { id: 'bloom-amber-dark', name: 'Bloom Amber Dark', desc: '琥珀暗夜' },
  { id: 'bloom-cinnabar', name: 'Bloom Cinnabar', desc: '朱砂红韵' },
  { id: 'bloom-cinnabar-dark', name: 'Bloom Cinnabar Dark', desc: '朱砂暗夜' },
  { id: 'bloom-ink', name: 'Bloom Ink', desc: '水墨清灰' },
  { id: 'bloom-ink-dark', name: 'Bloom Ink Dark', desc: '水墨玄黑' },
  { id: 'bloom-mist', name: 'Bloom Mist', desc: '薄雾青蓝' },
  { id: 'bloom-mist-dark', name: 'Bloom Mist Dark', desc: '薄雾暗夜' },
  { id: 'bloom-petal', name: 'Bloom Petal', desc: '花瓣樱粉' },
  { id: 'bloom-petal-dark', name: 'Bloom Petal Dark', desc: '花瓣暗夜' },
  { id: 'bloom-ripple', name: 'Bloom Ripple', desc: '涟漪湖青' },
  { id: 'bloom-ripple-dark', name: 'Bloom Ripple Dark', desc: '涟漪暗夜' },
  { id: 'bloom-sage', name: 'Bloom Sage', desc: '鼠尾草绿' },
  { id: 'bloom-sage-dark', name: 'Bloom Sage Dark', desc: '鼠尾暗夜' },
  { id: 'bloom-spring', name: 'Bloom Spring', desc: '春芽嫩绿' },
  { id: 'bloom-spring-dark', name: 'Bloom Spring Dark', desc: '春芽暗夜' },
  { id: 'bloom-stone', name: 'Bloom Stone', desc: '岩石暖灰' },
  { id: 'bloom-stone-dark', name: 'Bloom Stone Dark', desc: '岩石暗夜' },
  { id: 'bloom-verdant', name: 'Bloom Verdant', desc: '苍翠深绿' },
  { id: 'bloom-verdant-dark', name: 'Bloom Verdant Dark', desc: '苍翠暗夜' },
];

interface SettingsViewProps {
  settingCategory: SettingCategory;
  onSelectCategory: (cat: SettingCategory) => void;
  startupConfig: StartupConfig;
  onSaveStartupConfig: (cfg: StartupConfig) => void;
  onPickSpecificDir?: () => void;
  imageBed: ImageBedConfig;
  imageBedTestMsg: string;
  onUpdateImageBed: (next: ImageBedConfig, persist?: boolean) => void;
  onTestImageBed: () => void;
  theme: ThemeId;
  customThemeName: string;
  onSelectTheme: (t: ThemeId) => void;
  onImportTyporaTheme: () => void;
  authStates: Partial<Record<PlatformId, boolean>>;
  onPlatformLogin: (platformId: PlatformId) => void;
  workspacePath: string | null;
  gitStatus: GitStatusInfo;
  gitPushLog: string;
  onGitPush: () => void;
}

/** Preferences view for Image Bed, 24 Bloom Themes, Platform Auth, and GitHub Static Blog. */
export function SettingsView({
  settingCategory,
  onSelectCategory,
  startupConfig,
  onSaveStartupConfig,
  onPickSpecificDir,
  imageBed,
  imageBedTestMsg,
  onUpdateImageBed,
  onTestImageBed,
  theme,
  customThemeName,
  onSelectTheme,
  onImportTyporaTheme,
  authStates,
  onPlatformLogin,
  workspacePath,
  gitStatus,
  gitPushLog,
  onGitPush,
}: SettingsViewProps) {
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <aside className="w-44 shrink-0 overflow-y-auto border-r border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-4">
        <div className="mb-2 px-2 text-[11px] font-semibold tracking-wider text-[var(--control-text-color)] uppercase">
          偏好设置
        </div>
        {(
          [
            ['startup', '文件与启动', FileText],
            ['image', '图像与图床', ImageIcon],
            ['theme', '外观主题', Palette],
            ['platforms', '平台授权托管', Globe],
            ['github', 'GitHub 静态博客', GitBranch],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectCategory(id)}
            className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs ${
              settingCategory === id
                ? 'bg-[var(--accent)]/15 font-semibold text-[var(--accent)]'
                : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg-main)] p-6 text-[var(--text-main)] md:p-8">
        {settingCategory === 'startup' && (
          <div className="max-w-2xl space-y-5">
            <div>
              <h2 className="text-base font-semibold">启动选项与默认打开方式</h2>
              <p className="mt-1 text-xs text-[var(--control-text-color)]">
                控制每次打开 VCat Publisher 时默认加载的内容。
              </p>
            </div>
            <div className="space-y-3 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-[13px]">
              {(
                [
                  ['last_opened', '恢复上一次打开的文章（推荐）', '自动打开上次关闭前正在编辑的文件，若不存在则打开目录第一篇'],
                  ['new_file', '打开新文件', '每次启动自动新建一篇顺序命名的 Untitled.md 空白文章'],
                  ['specific_dir', '打开指定目录第一篇', '每次启动打开当前工作目录或指定目录下的第一篇 Markdown 文档'],
                ] as Array<[StartupMode, string, string]>
              ).map(([mode, title, desc]) => (
                <label key={mode} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={startupConfig.mode === mode}
                    onChange={() => onSaveStartupConfig({ ...startupConfig, mode })}
                  />
                  <div>
                    <div className="font-medium">{title}</div>
                    <div className="text-xs text-[var(--control-text-color)]">{desc}</div>
                  </div>
                </label>
              ))}
              {startupConfig.mode === 'specific_dir' && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="点击选择默认目录路径（留空则使用当前工作区）"
                    value={startupConfig.defaultDir ?? ''}
                    onClick={() => {
                      if (!startupConfig.defaultDir) onPickSpecificDir?.();
                    }}
                    onChange={(e) =>
                      onSaveStartupConfig({ ...startupConfig, defaultDir: e.target.value })
                    }
                    className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => onPickSpecificDir?.()}
                    className="shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    选择文件夹...
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {settingCategory === 'image' && (
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
        )}

        {settingCategory === 'theme' && (
          <div className="max-w-3xl space-y-4">
            <div>
              <h2 className="text-base font-semibold">外观主题（默认 Apple Light · 完整收录 Bloom 24 套）</h2>
              <p className="mt-1 text-xs text-[var(--control-text-color)]">
                也可随时通过 macOS 顶部菜单栏「主题」快速切换；基础色彩方案参考开源社区 Bloom / GitHub 主题规范。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
              {THEME_ITEMS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTheme(t.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    theme === t.id
                      ? 'border-[var(--accent)] bg-[var(--accent)]/12'
                      : 'border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="font-semibold text-[var(--text-main)]">{t.name}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--control-text-color)]">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-[var(--border-color)] pt-4">
              <button
                type="button"
                onClick={onImportTyporaTheme}
                className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                导入本地 Typora 主题 CSS 文件（如 bloom-lapis.css）...
              </button>
              {customThemeName && (
                <span className="ml-3 text-xs text-[var(--accent)]">
                  当前已加载：{customThemeName}.css
                </span>
              )}
            </div>
          </div>
        )}

        {settingCategory === 'platforms' && (
          <div className="max-w-3xl">
            <h2 className="text-base font-semibold">外部平台隔离沙箱托管</h2>
            <p className="mt-1 mb-4 text-xs text-[var(--control-text-color)]">
              每个平台运行在独立的 Electron <code>persist:platform_*</code> 沙箱内，Cookie 本地持久化不串号。
            </p>
            <div className="divide-y divide-[var(--border-color)] rounded border border-[var(--border-color)]">
              {PLATFORM_CATALOG.map((p) => {
                const online = Boolean(authStates[p.id]);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)]"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-[13px] font-semibold">
                        <span>{p.name}</span>
                        {online ? (
                          <span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-[11px] text-[#116329]">
                            ● 已授权
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--control-text-color)]">
                            未登录
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--control-text-color)]">
                        默认模式：{p.defaultMode === 'draft' ? '推入草稿箱' : '直接发布'} · 参考：{p.referenceSource}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPlatformLogin(p.id)}
                      className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      {online ? '更新授权' : '打开登录窗授权'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {settingCategory === 'github' && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-base font-semibold">GitHub 静态博客直推（本地 Git 模式）</h2>
            <p className="text-xs text-[var(--control-text-color)]">
              打开本地 Hexo / Hugo / VitePress 仓库，写完直接 Commit & Push 触发 GitHub Actions CI/CD。
            </p>
            <div className="space-y-2 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-xs">
              <div>当前工作区：<code>{workspacePath ?? '未挂载'}</code></div>
              <div>
                Git 仓库状态：
                {gitStatus.isGitRepo ? (
                  <span className="font-semibold text-[#116329]">
                    ✓ 已识别 Git 仓库（分支：{gitStatus.branch} · {gitStatus.changedFiles} 项待提交）
                  </span>
                ) : (
                  <span className="text-[var(--control-text-color)]">
                    当前目录不是 Git 仓库（可在左下角切换至静态博客仓库目录）
                  </span>
                )}
              </div>
              {gitStatus.isGitRepo && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onGitPush}
                    className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    一键 Commit & Push 触发 CI/CD
                  </button>
                </div>
              )}
              {gitPushLog && <div className="pt-1 text-[var(--accent)]">{gitPushLog}</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
