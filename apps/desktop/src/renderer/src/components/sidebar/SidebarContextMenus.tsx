import { useLayoutEffect, useRef, useState } from 'react';
import type { ArticleMeta } from '@vcat/shared';

export interface FileContextMenuState {
  x: number;
  y: number;
  article: ArticleMeta;
}

export interface EmptyContextMenuState {
  x: number;
  y: number;
}

interface SidebarContextMenusProps {
  fileContextMenu: FileContextMenuState | null;
  emptyContextMenu: EmptyContextMenuState | null;
  selectedPaths: string[];
  articles: ArticleMeta[];
  fileViewMode: 'list' | 'tree';
  onCloseFileMenu: () => void;
  onCloseEmptyMenu: () => void;
  onClearSelection: () => void;
  onOpenArticle: (article: ArticleMeta) => void;
  onStartCreateItem: (mode: 'file' | 'folder') => void;
  onOpenSearch: () => void;
  onChangeFileViewMode: (mode: 'list' | 'tree') => void;
  onDuplicateArticle: (article: ArticleMeta) => Promise<void>;
  onRenameStart: (article: ArticleMeta) => void;
  onDeleteArticle: (article: ArticleMeta) => Promise<void>;
  onBatchDeleteArticles?: (targets: ArticleMeta[]) => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
}

/**
 * Clamps context menu coordinates inside the viewport so menus opened near
 * the bottom or right edge never clip or hide batch-delete actions.
 */
function useClampedPosition(anchor: { x: number; y: number } | null) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchor) return;
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 192;
    const height = el?.offsetHeight ?? 260;
    const pad = 10;

    let left = anchor.x;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - width - pad);
    }

    let top = anchor.y;
    if (top + height > window.innerHeight - pad) {
      // Flip upward from the cursor when near the bottom of the window
      top = Math.max(pad, anchor.y - height);
      if (top + height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - height - pad);
      }
    }

    setPos({ left, top });
  }, [anchor]);

  return { menuRef, pos };
}

export function SidebarContextMenus({
  fileContextMenu,
  emptyContextMenu,
  selectedPaths,
  articles,
  fileViewMode,
  onCloseFileMenu,
  onCloseEmptyMenu,
  onClearSelection,
  onOpenArticle,
  onStartCreateItem,
  onOpenSearch,
  onChangeFileViewMode,
  onDuplicateArticle,
  onRenameStart,
  onDeleteArticle,
  onBatchDeleteArticles,
  onRefreshWorkspace,
}: SidebarContextMenusProps) {
  const filePos = useClampedPosition(fileContextMenu);
  const emptyPos = useClampedPosition(emptyContextMenu);
  const isBatch = selectedPaths.length > 1;

  return (
    <>
      {fileContextMenu && (
        <div
          ref={filePos.menuRef}
          style={{ left: `${filePos.pos.left}px`, top: `${filePos.pos.top}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 max-h-[calc(100vh-20px)] w-48 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1 text-[12.5px] text-[var(--text-main)] shadow-xl backdrop-blur-md"
        >
          {isBatch ? (
            <>
              <div className="px-3.5 py-1 text-[11px] font-medium text-[var(--control-text-color)]">
                已选中 {selectedPaths.length} 篇文档
              </div>
              <button
                type="button"
                onClick={() => {
                  onCloseFileMenu();
                  if (onBatchDeleteArticles) {
                    const targets = articles.filter((a) => selectedPaths.includes(a.relativePath));
                    onClearSelection();
                    void onBatchDeleteArticles(targets);
                  }
                }}
                className="block w-full px-3.5 py-1.5 text-left font-medium text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
              >
                批量删除 ({selectedPaths.length} 篇)...
              </button>
              <button
                type="button"
                onClick={() => {
                  const fullPaths = articles
                    .filter((a) => selectedPaths.includes(a.relativePath))
                    .map((a) => a.fullPath)
                    .join('\n');
                  void navigator.clipboard.writeText(fullPaths);
                  onCloseFileMenu();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                批量复制路径 ({selectedPaths.length} 篇)
              </button>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                type="button"
                onClick={() => {
                  onClearSelection();
                  onCloseFileMenu();
                }}
                className="block w-full px-3.5 py-1 text-left text-[var(--control-text-color)] hover:bg-[#007aff] hover:text-white"
              >
                取消多选
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onOpenArticle(fileContextMenu.article);
                  onCloseFileMenu();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                打开
              </button>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                type="button"
                onClick={() => {
                  onCloseFileMenu();
                  onStartCreateItem('file');
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                新建文件
              </button>
              <button
                type="button"
                onClick={() => {
                  onCloseFileMenu();
                  onStartCreateItem('folder');
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                新建文件夹
              </button>
              <button
                type="button"
                onClick={() => {
                  onCloseFileMenu();
                  onOpenSearch();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                搜索
              </button>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                type="button"
                onClick={() => {
                  onChangeFileViewMode('list');
                  onCloseFileMenu();
                }}
                className="flex w-full items-center justify-between px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                <span>文档列表</span>
                {fileViewMode === 'list' && <span>✓</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeFileViewMode('tree');
                  onCloseFileMenu();
                }}
                className="flex w-full items-center justify-between px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                <span>文档树</span>
                {fileViewMode === 'tree' && <span>✓</span>}
              </button>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                type="button"
                onClick={() => {
                  const target = fileContextMenu.article;
                  onCloseFileMenu();
                  void onDuplicateArticle(target);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                创建副本
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = fileContextMenu.article;
                  onCloseFileMenu();
                  onRenameStart(target);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                重命名...
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = fileContextMenu.article;
                  onCloseFileMenu();
                  void onDeleteArticle(target);
                }}
                className="block w-full px-3.5 py-1 text-left text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
              >
                删除...
              </button>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(fileContextMenu.article.fullPath);
                  onCloseFileMenu();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                复制文件路径
              </button>
              <button
                type="button"
                onClick={() => {
                  const rel = fileContextMenu.article.relativePath;
                  onCloseFileMenu();
                  void window.electronAPI.showInFinder(rel);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
              >
                在 Finder 中显示
              </button>
            </>
          )}
        </div>
      )}

      {emptyContextMenu && (
        <div
          ref={emptyPos.menuRef}
          style={{ left: `${emptyPos.pos.left}px`, top: `${emptyPos.pos.top}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 max-h-[calc(100vh-20px)] w-44 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1 text-[12.5px] text-[var(--text-main)] shadow-xl backdrop-blur-md"
        >
          <button
            type="button"
            onClick={() => {
              onCloseEmptyMenu();
              onStartCreateItem('file');
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            新建文件
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseEmptyMenu();
              onStartCreateItem('folder');
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            新建文件夹
          </button>
          <div className="my-1 border-t border-[var(--border-color)]" />
          <button
            type="button"
            onClick={() => {
              onCloseEmptyMenu();
              onOpenSearch();
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            搜索
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseEmptyMenu();
              void onRefreshWorkspace();
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseEmptyMenu();
              void window.electronAPI.showInFinder();
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            在 Finder 中显示
          </button>
        </div>
      )}
    </>
  );
}
