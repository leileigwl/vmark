import { FolderOpen, Plus } from 'lucide-react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import type { ArticleMeta, GitStatusInfo } from '@vcat/shared';

interface ArticleManagerViewProps {
  workspacePath: string | null;
  gitStatus: GitStatusInfo;
  articles: ArticleMeta[];
  totalLocalImages: number;
  onSelectWorkspace: () => void;
  onCreateArticle: () => void;
  onOpenArticle: (art: ArticleMeta) => void;
  onPublishArticle: (art: ArticleMeta) => void;
}

/** Workspace article management dashboard with counts, Git status, and quick publish triggers. */
export function ArticleManagerView({
  workspacePath,
  gitStatus,
  articles,
  totalLocalImages,
  onSelectWorkspace,
  onCreateArticle,
  onOpenArticle,
  onPublishArticle,
}: ArticleManagerViewProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-main)] p-8 text-[var(--text-main)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">文章管理台</h1>
          <p className="mt-1 text-xs text-[var(--control-text-color)]">
            当前目录：<code>{workspacePath ?? '未挂载'}</code>
            {gitStatus.isGitRepo && (
              <span className="ml-2 rounded bg-[#dafbe1] px-2 py-0.5 text-[#116329]">
                Git: {gitStatus.branch} ({gitStatus.changedFiles} 项待推送)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectWorkspace}
            className="flex items-center gap-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            切换目录
          </button>
          <button
            type="button"
            onClick={onCreateArticle}
            className="flex items-center gap-1 rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            新建空白文章
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3">
          <div className="text-xs text-[var(--control-text-color)]">本地文章总数</div>
          <div className="mt-1 text-xl font-semibold">{articles.length} 篇</div>
        </div>
        <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3">
          <div className="text-xs text-[var(--control-text-color)]">本地 assets 引用</div>
          <div className="mt-1 text-xl font-semibold">{totalLocalImages} 张</div>
        </div>
        <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3">
          <div className="text-xs text-[var(--control-text-color)]">已注册平台适配器</div>
          <div className="mt-1 text-xl font-semibold text-[var(--accent)]">
            {PLATFORM_CATALOG.length} 个
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--border-color)]">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--control-text-color)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">文章标题 & 路径</th>
              <th className="px-4 py-2.5 font-semibold">字数</th>
              <th className="px-4 py-2.5 font-semibold">本地配图</th>
              <th className="px-4 py-2.5 font-semibold">最后修改</th>
              <th className="px-4 py-2.5 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {articles.map((art) => (
              <tr key={art.relativePath} className="hover:bg-[var(--bg-hover)]">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenArticle(art)}
                    className="font-semibold text-[var(--accent)] hover:underline"
                  >
                    {art.title}
                  </button>
                  <div className="text-[11px] text-[var(--control-text-color)]">{art.relativePath}</div>
                </td>
                <td className="px-4 py-3">{art.wordCount}</td>
                <td className="px-4 py-3">{art.localImageCount} 张</td>
                <td className="px-4 py-3 text-xs text-[var(--control-text-color)]">
                  {new Date(art.updatedAt).toLocaleString('zh-CN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenArticle(art)}
                      className="rounded border border-[var(--border-color)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs hover:bg-[var(--bg-hover)]"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => onPublishArticle(art)}
                      className="rounded bg-[var(--accent)] px-2.5 py-1 text-xs text-white hover:opacity-90"
                    >
                      分发
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
