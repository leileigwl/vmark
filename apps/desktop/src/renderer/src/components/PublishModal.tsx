import { PLATFORM_CATALOG } from '@vcat/adapters';
import type { ArticleMeta, GitStatusInfo } from '@vcat/shared';

interface PublishModalProps {
  activeArticle: ArticleMeta | null;
  gitStatus: GitStatusInfo;
  gitPushLog: string;
  markdown: string;
  onClose: () => void;
  onGitPush: () => void;
  onSaveArticle: (content: string) => void;
}

/** Multi-platform publish & local Git CI/CD push modal. */
export function PublishModal({
  activeArticle,
  gitStatus,
  gitPushLog,
  markdown,
  onClose,
  onGitPush,
  onSaveArticle,
}: PublishModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs">
      <div className="w-[480px] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold">
          <span>合并分发（{activeArticle?.title ?? '未选择文章'}）</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--control-text-color)] hover:text-[var(--text-main)]"
          >
            关闭
          </button>
        </div>
        <div className="space-y-3 p-4 text-[13px] text-[var(--control-text-color)]">
          {gitStatus.isGitRepo && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
              <div>
                <div className="font-medium text-[var(--text-main)]">
                  GitHub 静态博客 ({gitStatus.branch})
                </div>
                <div className="text-[11px]">{gitStatus.changedFiles} 项改动待推送</div>
              </div>
              <button
                type="button"
                onClick={onGitPush}
                className="rounded bg-[var(--accent)] px-2.5 py-1 text-xs text-white hover:opacity-90"
              >
                Commit & Push
              </button>
            </div>
          )}
          {gitPushLog && <div className="text-xs text-[var(--accent)]">{gitPushLog}</div>}
          <p className="text-xs">
            其他平台（微信公众号、Linux.do、博客园、掘金、小红书等）已注册 {PLATFORM_CATALOG.length}{' '}
            个适配器，可在「偏好设置 → 平台授权托管」先完成沙箱登录。
          </p>
          <div className="flex justify-end gap-2 pt-2">
            {activeArticle && (
              <button
                type="button"
                onClick={() => {
                  onSaveArticle(markdown);
                  onClose();
                }}
                className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                保存本地文章
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
