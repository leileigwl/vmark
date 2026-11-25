import type { ReactNode } from 'react';
import { FileText, GitBranch, Globe, Image as ImageIcon, Palette, SlidersHorizontal } from 'lucide-react';
import type {
  EditorPreferences,
  GitStatusInfo,
  ImageBedConfig,
  PlatformId,
  StartupConfig,
  StartupMode,
  ThemeId,
} from '@vcat/shared';
import { SettingsImageBedSection } from './settings/SettingsImageBedSection';
import {
  SettingsPlatformsSection,
  SettingsThemeSection,
} from './settings/SettingsThemeAndPlatformsSection';

export type SettingCategory = 'startup' | 'editor' | 'image' | 'theme' | 'platforms' | 'github';

interface SettingsViewProps {
  settingCategory: SettingCategory;
  onSelectCategory: (cat: SettingCategory) => void;
  startupConfig: StartupConfig;
  onSaveStartupConfig: (cfg: StartupConfig) => void;
  onPickSpecificDir?: () => void;
  editorPrefs: EditorPreferences;
  onUpdateEditorPrefs: (next: EditorPreferences) => void;
  onExportArticle: (format: 'docx' | 'html' | 'pdf') => void;
  imageBed: ImageBedConfig;
  imageBedTestMsg: string;
  onUpdateImageBed: (next: ImageBedConfig, persist?: boolean) => void;
  onTestImageBed: () => void;
  theme: ThemeId;
  customThemeName: string;
  onSelectTheme: (t: ThemeId) => void;
  onImportTyporaTheme: () => void;
  workspacePath: string | null;
  gitStatus: GitStatusInfo;
  gitPushLog: string;
  onGitPush: () => void;
  updateCard?: ReactNode;
}

/** Preferences view for Image Bed, 24 Bloom Themes, Platform Auth, and GitHub Static Blog. */
export function SettingsView({
  settingCategory,
  onSelectCategory,
  startupConfig,
  onSaveStartupConfig,
  onPickSpecificDir,
  editorPrefs,
  onUpdateEditorPrefs,
  onExportArticle,
  imageBed,
  imageBedTestMsg,
  onUpdateImageBed,
  onTestImageBed,
  theme,
  customThemeName,
  onSelectTheme,
  onImportTyporaTheme,
  workspacePath,
  gitStatus,
  gitPushLog,
  onGitPush,
  updateCard,
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
            ['editor', '编辑与导出', SlidersHorizontal],
            ['image', '图像与图床', ImageIcon],
            ['theme', '外观主题', Palette],
            ['platforms', '平台账号', Globe],
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
                控制每次打开 Vmark（维记）时默认加载的内容。
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
            {updateCard}
          </div>
        )}

        {settingCategory === 'editor' && (
          <div className="max-w-2xl space-y-5">
            <div>
              <h2 className="text-base font-semibold">编辑习惯与导出偏好</h2>
              <p className="mt-1 text-xs text-[var(--control-text-color)]">
                配置符号自动配对、默认复制内容格式以及文件导出习惯。
              </p>
            </div>

            <div className="space-y-4 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 text-[13px]">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <div className="font-medium">自动匹配符号</div>
                  <div className="text-xs text-[var(--control-text-color)]">
                    输入 <code>( [ {`{`} &quot; &apos; ` （ 【 「</code> 时自动补全右半符号，选中文字时直接包裹
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editorPrefs.autoPairSymbols}
                  onChange={(e) =>
                    onUpdateEditorPrefs({ ...editorPrefs, autoPairSymbols: e.target.checked })
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>

              <div className="border-t border-[var(--border-color)] pt-3">
                <div className="mb-2 font-medium">默认复制行为（Cmd+C）</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['markdown', 'Markdown 源码（推荐）'],
                      ['plain', '纯文本'],
                      ['html', '带格式富文本 (HTML)'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onUpdateEditorPrefs({ ...editorPrefs, copyFormat: val })}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                        editorPrefs.copyFormat === val
                          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--border-color)] pt-3">
                <div className="mb-2 font-medium">默认导出格式（Cmd+Shift+E 快速导出）</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['docx', 'Word 文档 (.docx)'],
                      ['html', '独立网页 (.html)'],
                      ['pdf', 'PDF 文档 (.pdf)'],
                    ] as const
                  ).map(([fmt, label]) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onUpdateEditorPrefs({ ...editorPrefs, defaultExportFormat: fmt })}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                        editorPrefs.defaultExportFormat === fmt
                          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onExportArticle(editorPrefs.defaultExportFormat)}
                    className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    立即导出当前文章为 .{editorPrefs.defaultExportFormat}
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportArticle('pdf')}
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-1.5 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    导出 PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportArticle('html')}
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-1.5 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    导出 HTML
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {settingCategory === 'image' && (
          <SettingsImageBedSection
            imageBed={imageBed}
            imageBedTestMsg={imageBedTestMsg}
            onUpdateImageBed={onUpdateImageBed}
            onTestImageBed={onTestImageBed}
          />
        )}

        {settingCategory === 'theme' && (
          <SettingsThemeSection
            theme={theme}
            customThemeName={customThemeName}
            onSelectTheme={onSelectTheme}
            onImportTyporaTheme={onImportTyporaTheme}
          />
        )}

        {settingCategory === 'platforms' && (
          <SettingsPlatformsSection />
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
