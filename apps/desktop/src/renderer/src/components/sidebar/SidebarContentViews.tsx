import { FileText, Folder } from 'lucide-react';
import type { ArticleMeta, ArticleSearchResult, OutlineNode } from '@vcat/shared';
import type { SidebarContextMenu } from './SidebarContextMenus';
import { SidebarTreeNodes } from './SidebarTreeNodes';
import type { TreeNode } from './sidebarTreeUtils';

interface SidebarContentViewsProps {
  sideTab: 'files' | 'outline';
  creatingItem: { type: 'file' | 'folder'; parentDir?: string; draft: string } | null;
  isConfirmingCreateRef: React.MutableRefObject<boolean>;
  onChangeCreatingDraft: (draft: string) => void;
  onConfirmCreateItem: () => Promise<void>;
  onCancelCreateItem: () => void;
  fileSearchQuery: string;
  contentSearchResults: ArticleSearchResult[] | null;
  articles: ArticleMeta[];
  folders: string[];
  filteredArticles: ArticleMeta[];
  fileTree: TreeNode[];
  fileViewMode: 'tree' | 'list';
  activeArticle: ArticleMeta | null;
  selectedPaths: string[];
  expandedDirs: Record<string, boolean>;
  dragOverFolder: string | null;
  renamingPath: string | null;
  renameDraft: string;
  outlineNodes: OutlineNode[];
  activeOutlineIdx: number | null;
  onOpenArticle: (art: ArticleMeta, searchKeyword?: string) => void;
  onArticleItemClick: (e: React.MouseEvent, art: ArticleMeta) => void;
  onFolderClick: (e: React.MouseEvent, folderPath: string) => void;
  onSetSelectedPaths: (paths: string[]) => void;
  onSetLastClickedPath: (path: string | null) => void;
  onSetContextMenu: (menu: SidebarContextMenu | null) => void;
  onToggleDir: (dirPath: string) => void;
  onExpandDir: (dirPath: string) => void;
  onSetDragOverFolder: (folder: string | null) => void;
  onMoveFolder: (oldFolder: string, targetParent: string) => Promise<void>;
  onMoveArticle: (oldPath: string, targetFolder: string) => Promise<void>;
  onImportExternalFiles?: (filePaths: string[], targetFolder?: string) => Promise<void>;
  onRenameStart: (art: ArticleMeta) => void;
  onRenameDraftChange: (draft: string) => void;
  onRenameSubmit: (oldPath: string) => Promise<void>;
  onRenameCancel: () => void;
  onSelectOutline: (text: string, idx: number) => void;
}

/** Main scrollable body for the left sidebar (create prompt, search, list, tree, outline). */
export function SidebarContentViews({
  sideTab,
  creatingItem,
  isConfirmingCreateRef,
  onChangeCreatingDraft,
  onConfirmCreateItem,
  onCancelCreateItem,
  fileSearchQuery,
  contentSearchResults,
  articles,
  folders,
  filteredArticles,
  fileTree,
  fileViewMode,
  activeArticle,
  selectedPaths,
  expandedDirs,
  dragOverFolder,
  renamingPath,
  renameDraft,
  outlineNodes,
  activeOutlineIdx,
  onOpenArticle,
  onArticleItemClick,
  onFolderClick,
  onSetSelectedPaths,
  onSetLastClickedPath,
  onSetContextMenu,
  onToggleDir,
  onExpandDir,
  onSetDragOverFolder,
  onMoveFolder,
  onMoveArticle,
  onImportExternalFiles,
  onRenameStart,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
  onSelectOutline,
}: SidebarContentViewsProps) {
  return (
    <>
      {sideTab === 'files' && creatingItem && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-md border border-[var(--accent)]/60 bg-[var(--bg-main)]/85 px-2 py-1 shadow-sm backdrop-blur-md">
          {creatingItem.type === 'folder' ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          )}
          <input
            type="text"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={creatingItem.draft}
            onChange={(e) => onChangeCreatingDraft(e.target.value)}
            onBlur={() => void onConfirmCreateItem()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void onConfirmCreateItem();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                isConfirmingCreateRef.current = true;
                onCancelCreateItem();
                queueMicrotask(() => {
                  isConfirmingCreateRef.current = false;
                });
              }
            }}
            placeholder={creatingItem.type === 'folder' ? '输入文件夹名后回车...' : '输入文件名 (.md) 后回车...'}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-main)] outline-none"
          />
        </div>
      )}

      {sideTab === 'files' ? (
        fileSearchQuery.trim() && contentSearchResults ? (
          contentSearchResults.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[var(--control-text-color)]">未找到匹配的文件或正文内容</div>
          ) : (
            <div className="space-y-1">
              {contentSearchResults.map((res) => {
                const art = articles.find((a) => a.relativePath === res.relativePath);
                const isSelected = activeArticle?.relativePath === res.relativePath;
                return (
                  <button
                    key={res.relativePath}
                    type="button"
                    onClick={() => {
                      if (art) onOpenArticle(art, fileSearchQuery.trim());
                    }}
                    className={`block w-full rounded px-2.5 py-1.5 text-left ${
                      isSelected
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[12.5px] font-medium">
                      <span className="truncate">{res.relativePath}</span>
                      {res.matchCount > 0 && (
                        <span className="shrink-0 rounded bg-black/10 px-1 text-[10px] text-[var(--control-text-color)]">
                          {res.matchCount}
                        </span>
                      )}
                    </div>
                    {res.snippet && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--control-text-color)]">
                        {res.snippet}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )
        ) : articles.length === 0 && folders.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--control-text-color)]">暂无 Markdown 文件</div>
        ) : fileViewMode === 'list' ? (
          filteredArticles.map((art) => {
            const isMultiSelected = selectedPaths.length > 1 && selectedPaths.includes(art.relativePath);
            const isSelected = isMultiSelected || activeArticle?.relativePath === art.relativePath;
            return (
              <button
                key={art.relativePath}
                data-article-path={art.relativePath}
                type="button"
                onClick={(e) => onArticleItemClick(e, art)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selectedPaths.includes(art.relativePath)) {
                    onSetSelectedPaths([art.relativePath]);
                    onSetLastClickedPath(art.relativePath);
                  }
                  onSetContextMenu({ type: 'file', x: e.clientX, y: e.clientY, article: art });
                }}
                className={`flex w-full items-center gap-1.5 rounded px-2.5 py-[4px] text-left text-[12.5px] leading-5 ${
                  isSelected
                    ? 'bg-[var(--accent)]/15 font-medium text-[var(--accent)]'
                    : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" />
                <span className="truncate">{art.relativePath}</span>
              </button>
            );
          })
        ) : (
          <SidebarTreeNodes
            nodes={fileTree}
            expandedDirs={expandedDirs}
            dragOverFolder={dragOverFolder}
            selectedPaths={selectedPaths}
            selectedFolders={selectedPaths.filter((p) => folders.includes(p))}
            activeArticlePath={activeArticle?.relativePath ?? null}
            renamingPath={renamingPath}
            renameDraft={renameDraft}
            onToggleDir={onToggleDir}
            onExpandDir={onExpandDir}
            onSetDragOverFolder={onSetDragOverFolder}
            onMoveFolder={onMoveFolder}
            onMoveArticle={onMoveArticle}
            onImportExternalFiles={onImportExternalFiles}
            onArticleClick={onArticleItemClick}
            onFolderClick={onFolderClick}
            onRenameStart={onRenameStart}
            onRenameDraftChange={onRenameDraftChange}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            onOpenFolderContextMenu={(x, y, folderPath) => {
              if (!selectedPaths.includes(folderPath)) {
                onSetSelectedPaths([folderPath]);
                onSetLastClickedPath(folderPath);
              }
              onSetContextMenu({ type: 'folder', x, y, folderPath });
            }}
            onOpenFileContextMenu={(x, y, art) => {
              if (!selectedPaths.includes(art.relativePath)) {
                onSetSelectedPaths([art.relativePath]);
                onSetLastClickedPath(art.relativePath);
              }
              onSetContextMenu({ type: 'file', x, y, article: art });
            }}
          />
        )
      ) : outlineNodes.length === 0 ? (
        <div className="px-3 py-4 text-xs text-[var(--control-text-color)]">暂无标题大纲</div>
      ) : (
        outlineNodes.map((node, idx) => {
          const isActive = activeOutlineIdx === idx;
          return (
            <button
              type="button"
              key={`${node.line}-${idx}`}
              title={node.text}
              onClick={() => onSelectOutline(node.text, idx)}
              style={{ paddingLeft: `${8 + (node.level - 1) * 12}px` }}
              className={`block w-full cursor-pointer truncate rounded-md py-1 pr-2 text-left text-[12.5px] leading-5 transition-colors duration-100 ${
                isActive
                  ? 'bg-[var(--accent)]/16 font-medium text-[var(--accent)]'
                  : 'text-[var(--text-main)] hover:bg-[var(--accent)]/12 hover:text-[var(--accent)]'
              }`}
            >
              {node.text}
            </button>
          );
        })
      )}
    </>
  );
}
