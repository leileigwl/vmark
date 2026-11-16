import type { MouseEvent } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { ArticleMeta } from '@vcat/shared';
import type { TreeNode } from './sidebarTreeUtils';

interface SidebarTreeNodesProps {
  nodes: TreeNode[];
  depth?: number;
  expandedDirs: Record<string, boolean>;
  dragOverFolder: string | null;
  selectedPaths: string[];
  activeArticlePath?: string | null;
  renamingPath: string | null;
  renameDraft: string;
  onToggleDir: (dirPath: string) => void;
  onExpandDir: (dirPath: string) => void;
  onSetDragOverFolder: (dirPath: string | null) => void;
  onMoveFolder: (oldFolder: string, targetFolder: string) => Promise<void>;
  onMoveArticle: (oldPath: string, targetFolder: string) => Promise<void>;
  onArticleClick: (e: MouseEvent, article: ArticleMeta) => void;
  onRenameStart: (article: ArticleMeta) => void;
  onRenameDraftChange: (val: string) => void;
  onRenameSubmit: (oldPath: string) => Promise<void>;
  onRenameCancel: () => void;
  onOpenFileContextMenu: (x: number, y: number, article: ArticleMeta) => void;
}

/** Recursive file tree renderer supporting drag-move, multi-selection, and inline renaming. */
export function SidebarTreeNodes({
  nodes,
  depth = 0,
  expandedDirs,
  dragOverFolder,
  selectedPaths,
  activeArticlePath,
  renamingPath,
  renameDraft,
  onToggleDir,
  onExpandDir,
  onSetDragOverFolder,
  onMoveFolder,
  onMoveArticle,
  onArticleClick,
  onRenameStart,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
  onOpenFileContextMenu,
}: SidebarTreeNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.isDir) {
          const isOpen = expandedDirs[node.path] ?? true;
          const isDragOver = dragOverFolder === node.path;
          return (
            <div key={node.path}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-vcat-folder', node.path);
                }}
                onClick={() => onToggleDir(node.path)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSetDragOverFolder(node.path);
                }}
                onDragLeave={() => {
                  if (dragOverFolder === node.path) onSetDragOverFolder(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSetDragOverFolder(null);
                  const folderPath = e.dataTransfer.getData('application/x-vcat-folder');
                  if (folderPath) {
                    void onMoveFolder(folderPath, node.path);
                    return;
                  }
                  const sourcePath = e.dataTransfer.getData('text/plain');
                  if (sourcePath) {
                    void onMoveArticle(sourcePath, node.path).then(() => {
                      onExpandDir(node.path);
                    });
                  }
                }}
                style={{ paddingLeft: `${8 + depth * 12}px` }}
                className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[12.5px] text-[var(--text-main)] ${
                  isDragOver ? 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]' : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-[var(--control-text-color)]" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-[var(--control-text-color)]" />
                )}
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--control-text-color)]" />
                <span className="truncate">{node.name}</span>
              </button>
              {isOpen && (
                <SidebarTreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  expandedDirs={expandedDirs}
                  dragOverFolder={dragOverFolder}
                  selectedPaths={selectedPaths}
                  activeArticlePath={activeArticlePath}
                  renamingPath={renamingPath}
                  renameDraft={renameDraft}
                  onToggleDir={onToggleDir}
                  onExpandDir={onExpandDir}
                  onSetDragOverFolder={onSetDragOverFolder}
                  onMoveFolder={onMoveFolder}
                  onMoveArticle={onMoveArticle}
                  onArticleClick={onArticleClick}
                  onRenameStart={onRenameStart}
                  onRenameDraftChange={onRenameDraftChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  onOpenFileContextMenu={onOpenFileContextMenu}
                />
              )}
            </div>
          );
        }

        const article = node.article;
        const isMultiSelected = Boolean(
          article && selectedPaths.length > 1 && selectedPaths.includes(article.relativePath)
        );
        const isSelected = isMultiSelected || activeArticlePath === article?.relativePath;
        const isRenaming = renamingPath === article?.relativePath;

        return (
          <div
            key={node.path}
            onContextMenu={(e) => {
              if (!article) return;
              e.preventDefault();
              e.stopPropagation();
              onOpenFileContextMenu(e.clientX, e.clientY, article);
            }}
          >
            {isRenaming && article ? (
              <div style={{ paddingLeft: `${22 + depth * 12}px` }} className="py-[2px] pr-2">
                <input
                  type="text"
                  autoFocus
                  onFocus={(e) => {
                    const dotIdx = e.currentTarget.value.lastIndexOf('.');
                    if (dotIdx > 0) e.currentTarget.setSelectionRange(0, dotIdx);
                    else e.currentTarget.select();
                  }}
                  value={renameDraft}
                  onChange={(e) => onRenameDraftChange(e.target.value)}
                  onBlur={() => void onRenameSubmit(article.relativePath)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onRenameSubmit(article.relativePath);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      onRenameCancel();
                    }
                  }}
                  className="w-full rounded border border-[var(--accent)] bg-[var(--bg-main)] px-1.5 py-0.5 text-[12.5px] text-[var(--text-main)] outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                draggable={Boolean(article)}
                onDragStart={(e) => {
                  if (article) e.dataTransfer.setData('text/plain', article.relativePath);
                }}
                onClick={(e) => {
                  if (article) onArticleClick(e, article);
                }}
                onDoubleClick={() => {
                  if (article) onRenameStart(article);
                }}
                style={{ paddingLeft: `${22 + depth * 12}px` }}
                className={`flex w-full items-center gap-1.5 rounded py-[3px] pr-2 text-left text-[12.5px] leading-5 ${
                  isSelected
                    ? 'bg-[var(--accent)]/15 font-medium text-[var(--accent)]'
                    : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" />
                <span className="truncate">{node.name}</span>
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
