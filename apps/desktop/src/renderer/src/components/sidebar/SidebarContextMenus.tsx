import { useLayoutEffect, useRef, useState } from 'react';
import type { ArticleMeta } from '@vcat/shared';

export type SidebarContextMenu =
  | { type: 'file'; x: number; y: number; article: ArticleMeta }
  | { type: 'folder'; x: number; y: number; folderPath: string }
  | { type: 'empty'; x: number; y: number };

interface SidebarContextMenusProps {
  menu: SidebarContextMenu | null;
  selectedPaths: string[];
  articles: ArticleMeta[];
  folders: string[];
  fileViewMode: 'list' | 'tree';
  onCloseMenu: () => void;
  onClearSelection: () => void;
  onOpenArticle: (article: ArticleMeta) => void;
  onStartCreateItem: (mode: 'file' | 'folder', parentDir?: string) => void;
  onOpenSearch: () => void;
  onChangeFileViewMode: (mode: 'list' | 'tree') => void;
  onDuplicateArticle: (article: ArticleMeta) => Promise<void>;
  onRenameStart: (article: ArticleMeta) => void;
  onDeleteArticle: (article: ArticleMeta) => Promise<void>;
  onBatchDeleteArticles?: (targets: ArticleMeta[]) => Promise<void>;
  onDeleteFolder?: (folderPath: string) => Promise<void>;
  onBatchDeleteItems?: (articles: ArticleMeta[], folders: string[]) => Promise<void>;
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
  menu,
  selectedPaths,
  articles,
  folders,
  fileViewMode,
  onCloseMenu,
  onClearSelection,
  onOpenArticle,
  onStartCreateItem,
  onOpenSearch,
  onChangeFileViewMode,
  onDuplicateArticle,
  onRenameStart,
  onDeleteArticle,
  onBatchDeleteArticles,
  onDeleteFolder,
  onBatchDeleteItems,
  onRefreshWorkspace,
}: SidebarContextMenusProps) {
  const { menuRef, pos } = useClampedPosition(menu);
  if (!menu) return null;

  const isBatch = selectedPaths.length > 1;

  if (menu.type === 'file') {
    const article = menu.article;
    return (
      <div
        ref={menuRef}
        data-sidebar-context-menu="1"
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-50 max-h-[calc(100vh-20px)] w-48 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1 text-[12.5px] text-[var(--text-main)] shadow-xl backdrop-blur-md"
      >
        {isBatch ? (
          <>
            <div className="px-3.5 py-1 text-[11px] font-medium text-[var(--control-text-color)]">
              已选中 {selectedPaths.length} 项
            </div>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                const fileTargets = articles.filter((a) => selectedPaths.includes(a.relativePath));
                const folderTargets = folders.filter((f) => selectedPaths.includes(f));
                onClearSelection();
                if (folderTargets.length > 0 && onBatchDeleteItems) {
                  void onBatchDeleteItems(fileTargets, folderTargets);
                } else if (onBatchDeleteArticles) {
                  void onBatchDeleteArticles(fileTargets);
                }
              }}
              className="block w-full px-3.5 py-1.5 text-left font-medium text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
            >
              批量删除 ({selectedPaths.length} 项)...
            </button>
            <button
              type="button"
              onClick={() => {
                const fullPaths = articles
                  .filter((a) => selectedPaths.includes(a.relativePath))
                  .map((a) => a.fullPath)
                  .join('\n');
                void navigator.clipboard.writeText(fullPaths);
                onCloseMenu();
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
                onCloseMenu();
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
                onOpenArticle(article);
                onCloseMenu();
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              打开
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                const parentDir = article.relativePath.includes('/')
                  ? article.relativePath.split('/').slice(0, -1).join('/')
                  : undefined;
                onStartCreateItem('file', parentDir);
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              新建文件
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                const parentDir = article.relativePath.includes('/')
                  ? article.relativePath.split('/').slice(0, -1).join('/')
                  : undefined;
                onStartCreateItem('folder', parentDir);
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              新建文件夹
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
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
                onChangeFileViewMode(fileViewMode === 'list' ? 'tree' : 'list');
                onCloseMenu();
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
                onCloseMenu();
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
                onCloseMenu();
                void onDuplicateArticle(article);
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              创建副本
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                onRenameStart(article);
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              重命名...
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                void onDeleteArticle(article);
              }}
              className="block w-full px-3.5 py-1 text-left text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
            >
              删除...
            </button>
            <div className="my-1 border-t border-[var(--border-color)]" />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(article.fullPath);
                onCloseMenu();
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              复制文件路径
            </button>
            <button
              type="button"
              onClick={() => {
                void window.electronAPI.showInFinder(article.relativePath);
                onCloseMenu();
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              在 Finder 中显示
            </button>
          </>
        )}
      </div>
    );
  }

  if (menu.type === 'folder') {
    const folderPath = menu.folderPath;
    return (
      <div
        ref={menuRef}
        data-sidebar-context-menu="1"
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-50 max-h-[calc(100vh-20px)] w-48 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1 text-[12.5px] text-[var(--text-main)] shadow-xl backdrop-blur-md"
      >
        {isBatch ? (
          <>
            <div className="px-3.5 py-1 text-[11px] font-medium text-[var(--control-text-color)]">
              已选中 {selectedPaths.length} 项
            </div>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                const fileTargets = articles.filter((a) => selectedPaths.includes(a.relativePath));
                const folderTargets = folders.filter((f) => selectedPaths.includes(f));
                onClearSelection();
                if (onBatchDeleteItems) {
                  void onBatchDeleteItems(fileTargets, folderTargets);
                } else if (onBatchDeleteArticles && fileTargets.length > 0) {
                  void onBatchDeleteArticles(fileTargets);
                }
              }}
              className="block w-full px-3.5 py-1.5 text-left font-medium text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
            >
              批量删除 ({selectedPaths.length} 项)...
            </button>
            <div className="my-1 border-t border-[var(--border-color)]" />
            <button
              type="button"
              onClick={() => {
                onClearSelection();
                onCloseMenu();
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
                onCloseMenu();
                onStartCreateItem('file', folderPath);
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              新建文件
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                onStartCreateItem('folder', folderPath);
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              新建文件夹
            </button>
            <div className="my-1 border-t border-[var(--border-color)]" />
            <button
              type="button"
              onClick={() => {
                onCloseMenu();
                void onDeleteFolder?.(folderPath);
              }}
              className="block w-full px-3.5 py-1 text-left text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
            >
              删除文件夹...
            </button>
            <div className="my-1 border-t border-[var(--border-color)]" />
            <button
              type="button"
              onClick={() => {
                void window.electronAPI.showInFinder(folderPath);
                onCloseMenu();
              }}
              className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
            >
              在 Finder 中显示
            </button>
          </>
        )}
      </div>
    );
  }

  // menu.type === 'empty'
  return (
    <div
      ref={menuRef}
      data-sidebar-context-menu="1"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 max-h-[calc(100vh-20px)] w-44 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1 text-[12.5px] text-[var(--text-main)] shadow-xl backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => {
          onCloseMenu();
          onStartCreateItem('file');
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
      >
        新建文件
      </button>
      <button
        type="button"
        onClick={() => {
          onCloseMenu();
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
          onCloseMenu();
          onOpenSearch();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
      >
        搜索
      </button>
      <button
        type="button"
        onClick={() => {
          onCloseMenu();
          void onRefreshWorkspace();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
      >
        刷新
      </button>
      <button
        type="button"
        onClick={() => {
          void window.electronAPI.showInFinder();
          onCloseMenu();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
      >
        在 Finder 中显示
      </button>
      <div className="my-1 border-t border-[var(--border-color)]" />
      <button
        type="button"
        onClick={() => {
          onChangeFileViewMode(fileViewMode === 'list' ? 'tree' : 'list');
          onCloseMenu();
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
          onCloseMenu();
        }}
        className="flex w-full items-center justify-between px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
      >
        <span>文档树</span>
        {fileViewMode === 'tree' && <span>✓</span>}
      </button>
    </div>
  );
}
