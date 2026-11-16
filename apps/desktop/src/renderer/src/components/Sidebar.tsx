import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Folder,
  ListTree,
  MoreVertical,
  Plus,
  Redo2,
  Search,
  Undo2,
} from 'lucide-react';
import type { ArticleMeta, ArticleSearchResult, OutlineNode } from '@vcat/shared';
import {
  SidebarContextMenus,
  type SidebarContextMenu,
} from './sidebar/SidebarContextMenus';
import { SidebarPopoverMenu } from './sidebar/SidebarPopoverMenu';
import { SidebarTreeNodes } from './sidebar/SidebarTreeNodes';
import { buildFileTree, type TreeNode } from './sidebar/sidebarTreeUtils';

interface SidebarProps {
  open: boolean;
  width: number;
  isResizing: boolean;
  sideTab: 'files' | 'outline';
  workspaceName: string;
  workspacePath: string | null;
  recentWorkspaces: string[];
  articles: ArticleMeta[];
  folders: string[];
  activeArticle: ArticleMeta | null;
  outlineNodes: OutlineNode[];
  onChangeSideTab: (tab: 'files' | 'outline') => void;
  onStartResize: (e: React.MouseEvent) => void;
  onOpenArticle: (art: ArticleMeta) => void;
  onCreateFile: (name: string, parentDir?: string) => Promise<void>;
  onCreateFolder: (name: string, parentDir?: string) => Promise<void>;
  onRenameArticle: (oldPath: string, newName: string) => Promise<void>;
  onDeleteArticle: (art: ArticleMeta) => Promise<void>;
  onBatchDeleteArticles?: (targets: ArticleMeta[]) => Promise<void>;
  onDeleteFolder?: (folderPath: string) => Promise<void>;
  onBatchDeleteItems?: (articles: ArticleMeta[], folders: string[]) => Promise<void>;
  onDuplicateArticle: (art: ArticleMeta) => Promise<void>;
  onMoveArticle: (oldPath: string, targetFolder: string) => Promise<void>;
  onMoveFolder: (oldFolder: string, targetParent: string) => Promise<void>;
  onSelectWorkspace: () => Promise<void>;
  onSwitchRecentWorkspace: (dir: string) => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onJumpOutline: (headingText: string, index: number) => void;
  canUndoFileOp?: boolean;
  canRedoFileOp?: boolean;
  onUndoFileOp?: () => Promise<void>;
  onRedoFileOp?: () => Promise<void>;
}

/** Left macOS full-height sidebar with File Tree, Outline, Content Search, Drag-Move & Popover Menu. */
export function Sidebar({
  open,
  width,
  isResizing,
  sideTab,
  workspaceName,
  workspacePath,
  recentWorkspaces,
  articles,
  folders,
  activeArticle,
  outlineNodes,
  onChangeSideTab,
  onStartResize,
  onOpenArticle,
  onCreateFile,
  onCreateFolder,
  onRenameArticle,
  onDeleteArticle,
  onBatchDeleteArticles,
  onDeleteFolder,
  onBatchDeleteItems,
  onDuplicateArticle,
  onMoveArticle,
  onMoveFolder,
  onSelectWorkspace,
  onSwitchRecentWorkspace,
  onRefreshWorkspace,
  onJumpOutline,
  canUndoFileOp = false,
  canRedoFileOp = false,
  onUndoFileOp,
  onRedoFileOp,
}: SidebarProps) {
  const [sortBy, setSortBy] = useState<'name' | 'time'>('name');
  const [fileViewMode, setFileViewMode] = useState<'tree' | 'list'>('tree');
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [contentSearchResults, setContentSearchResults] = useState<ArticleSearchResult[] | null>(null);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [sidebarMenuPinned, setSidebarMenuPinned] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creatingItem, setCreatingItem] = useState<{
    type: 'file' | 'folder';
    parentDir?: string;
    draft: string;
  } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [activeOutlineIdx, setActiveOutlineIdx] = useState<number | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SidebarContextMenu | null>(null);

  const sidebarPopoverRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (selectedPaths.length <= 1) return;
    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target instanceof Element && target.closest('[data-sidebar-context-menu="1"]')) {
        return;
      }
      if (asideRef.current && target && !asideRef.current.contains(target)) {
        setSelectedPaths([]);
      }
    };
    window.addEventListener('mousedown', handleOutsideMouseDown);
    return () => window.removeEventListener('mousedown', handleOutsideMouseDown);
  }, [selectedPaths.length]);
  const isConfirmingCreateRef = useRef(false);

  // Keep single selection synced with activeArticle so switching via ArticleManagerView or shortcuts never leaves two highlighted items
  useEffect(() => {
    if (activeArticle?.relativePath) {
      setSelectedPaths([activeArticle.relativePath]);
      setLastClickedPath(activeArticle.relativePath);
    } else {
      setSelectedPaths([]);
      setLastClickedPath(null);
    }
  }, [activeArticle?.relativePath]);

  useEffect(() => {
    const q = fileSearchQuery.trim();
    if (!q) {
      setContentSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      void window.electronAPI.searchArticlesContent(q).then((res) => {
        setContentSearchResults(res);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [fileSearchQuery]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-sidebar-context-menu]')) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', handleDown, true);
    return () => window.removeEventListener('mousedown', handleDown, true);
  }, [contextMenu]);

  useEffect(() => {
    if (!sidebarMenuOpen || sidebarMenuPinned) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (sidebarPopoverRef.current && !sidebarPopoverRef.current.contains(e.target as Node)) {
        setSidebarMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [sidebarMenuOpen, sidebarMenuPinned]);

  const filteredArticles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    const base = q
      ? articles.filter(
          (a) => a.title.toLowerCase().includes(q) || a.relativePath.toLowerCase().includes(q)
        )
      : [...articles];
    if (sortBy === 'time') {
      return base.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return base.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [articles, fileSearchQuery, sortBy]);

  const fileTree = useMemo(
    () => buildFileTree(filteredArticles, fileSearchQuery.trim() ? [] : folders),
    [filteredArticles, folders, fileSearchQuery]
  );

  const flatVisibleArticles = useMemo(() => {
    if (fileViewMode === 'list') return filteredArticles;
    const acc: ArticleMeta[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.isDir) {
          if (expandedDirs[n.path] ?? true) walk(n.children);
        } else if (n.article) {
          acc.push(n.article);
        }
      }
    };
    walk(fileTree);
    return acc;
  }, [fileViewMode, filteredArticles, fileTree, expandedDirs]);

  function handleFolderClick(e: React.MouseEvent, folderPath: string) {
    if (suppressNextClickRef.current) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSelectedPaths((prev) =>
        prev.includes(folderPath) ? prev.filter((p) => p !== folderPath) : [...prev, folderPath]
      );
      setLastClickedPath(folderPath);
      return;
    }
    setSelectedPaths([folderPath]);
    setLastClickedPath(folderPath);
    setExpandedDirs((prev) => ({
      ...prev,
      [folderPath]: !(prev[folderPath] ?? true),
    }));
  }

  function handleArticleItemClick(e: React.MouseEvent, article: ArticleMeta) {
    if (suppressNextClickRef.current) return;
    if (e.shiftKey) {
      e.preventDefault();
      const anchorPath = lastClickedPath ?? activeArticle?.relativePath ?? article.relativePath;
      const idxA = flatVisibleArticles.findIndex((a) => a.relativePath === anchorPath);
      const idxB = flatVisibleArticles.findIndex((a) => a.relativePath === article.relativePath);
      if (idxA !== -1 && idxB !== -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        setSelectedPaths(flatVisibleArticles.slice(start, end + 1).map((a) => a.relativePath));
      } else {
        setSelectedPaths([article.relativePath]);
      }
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSelectedPaths((prev) =>
        prev.includes(article.relativePath)
          ? prev.filter((p) => p !== article.relativePath)
          : [...prev, article.relativePath]
      );
      setLastClickedPath(article.relativePath);
      return;
    }
    setSelectedPaths([article.relativePath]);
    setLastClickedPath(article.relativePath);
    onOpenArticle(article);
  }

  function startCreateItem(type: 'file' | 'folder', parentDir?: string) {
    onChangeSideTab('files');
    if (type === 'folder') setFileViewMode('tree');
    let defaultDraft = type === 'folder' ? '新建文件夹' : 'Untitled.md';
    if (type === 'folder') {
      let candidate = '新建文件夹';
      let i = 2;
      while (folders.includes(parentDir ? `${parentDir}/${candidate}` : candidate)) {
        candidate = `新建文件夹 ${i}`;
        i++;
      }
      defaultDraft = candidate;
    } else if (type === 'file') {
      let candidate = 'Untitled.md';
      let i = 2;
      while (articles.some((a) => a.relativePath === (parentDir ? `${parentDir}/${candidate}` : candidate))) {
        candidate = `Untitled ${i}.md`;
        i++;
      }
      defaultDraft = candidate;
    }
    setCreatingItem({ type, parentDir, draft: defaultDraft });
  }

  async function confirmCreateItem() {
    if (isConfirmingCreateRef.current || !creatingItem) return;
    isConfirmingCreateRef.current = true;
    const { type, parentDir, draft } = creatingItem;
    const raw = draft.trim();
    setCreatingItem(null);
    try {
      if (!raw) return;
      if (type === 'folder') {
        const rel = parentDir ? `${parentDir}/${raw}` : raw;
        await onCreateFolder(rel, parentDir);
        setExpandedDirs((prev) => ({ ...prev, [rel]: true }));
        return;
      }
      await onCreateFile(raw, parentDir);
    } finally {
      isConfirmingCreateRef.current = false;
    }
  }

  function handleRenameStart(article: ArticleMeta) {
    setRenamingPath(article.relativePath);
    setRenameDraft(article.relativePath.split('/').pop() ?? '');
  }

  async function handleRenameSubmit(oldRelativePath: string) {
    const nextName = renameDraft.trim();
    setRenamingPath(null);
    if (!nextName) return;
    await onRenameArticle(oldRelativePath, nextName);
  }

  return (
    <>
      <aside
        ref={asideRef}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest('input, textarea')) return;
          if (sideTab !== 'files' || renamingPath || creatingItem) return;
          if ((e.metaKey || e.ctrlKey) && !e.altKey) {
            if (e.repeat) {
              e.preventDefault();
              return;
            }
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              void onUndoFileOp?.();
              return;
            }
            if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
              e.preventDefault();
              e.stopPropagation();
              void onRedoFileOp?.();
              return;
            }
          }
        }}
        style={{
          width: open ? `${width}px` : '0px',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
        }}
        className={`relative flex h-screen shrink-0 flex-col overflow-hidden bg-[var(--side-bar-bg-color)] select-none ${
          open ? 'border-r border-[var(--border-color)]' : 'border-r-0'
        } ${!isResizing ? 'transition-[width,opacity] duration-200 ease-out' : ''}`}
      >
        <div className="app-drag flex h-[36px] shrink-0 items-center justify-end px-3" />

        <div className="flex h-8 shrink-0 items-center border-b border-[var(--border-color)] px-3 text-[12px]">
          <button
            type="button"
            onClick={() => onChangeSideTab('files')}
            className={`flex-1 py-1 text-center font-medium ${
              sideTab === 'files'
                ? 'border-b-2 border-[var(--accent)] text-[var(--text-main)]'
                : 'text-[var(--control-text-color)] hover:text-[var(--text-main)]'
            }`}
          >
            文件 ({articles.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeSideTab('outline')}
            className={`flex-1 py-1 text-center font-medium ${
              sideTab === 'outline'
                ? 'border-b-2 border-[var(--accent)] text-[var(--text-main)]'
                : 'text-[var(--control-text-color)] hover:text-[var(--text-main)]'
            }`}
          >
            大纲
          </button>
          <button
            type="button"
            title="搜索文件名或正文"
            onClick={() => {
              onChangeSideTab('files');
              setFileSearchOpen((v) => !v);
            }}
            className={`ml-1 rounded p-1 ${
              fileSearchOpen
                ? 'text-[var(--accent)]'
                : 'text-[var(--control-text-color)] hover:text-[var(--text-main)]'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>

        {fileSearchOpen && sideTab === 'files' && (
          <div className="border-b border-[var(--border-color)] px-2.5 py-1.5">
            <input
              type="text"
              autoFocus
              placeholder="搜索文件名或文章正文..."
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFileSearchQuery('');
                  setFileSearchOpen(false);
                }
              }}
              className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}

        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if (sideTab !== 'files' || renamingPath || creatingItem) return;
            if (filteredArticles.length === 0) return;
            const idx = filteredArticles.findIndex((a) => a.relativePath === activeArticle?.relativePath);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = filteredArticles[Math.min(filteredArticles.length - 1, idx + 1)] ?? filteredArticles[0];
              if (next) onOpenArticle(next);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prev = filteredArticles[Math.max(0, idx - 1)] ?? filteredArticles[0];
              if (prev) onOpenArticle(prev);
            } else if (e.key === 'ArrowLeft') {
              const currentPath = activeArticle?.relativePath ?? '';
              const parentDir = currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '';
              if (parentDir) {
                e.preventDefault();
                setExpandedDirs((prev) => ({ ...prev, [parentDir]: false }));
              }
            } else if (e.key === 'ArrowRight') {
              const currentPath = activeArticle?.relativePath ?? '';
              const parentDir = currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '';
              if (parentDir && expandedDirs[parentDir] === false) {
                e.preventDefault();
                setExpandedDirs((prev) => ({ ...prev, [parentDir]: true }));
              }
            } else if (e.key === 'Enter' || e.key === 'F2') {
              if (activeArticle) {
                e.preventDefault();
                handleRenameStart(activeArticle);
              }
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
              if (selectedPaths.length > 1) {
                e.preventDefault();
                const selectedSet = new Set(selectedPaths);
                const targetArticles = articles.filter((a) => selectedSet.has(a.relativePath));
                const targetFolders = folders.filter((f) => selectedSet.has(f));
                if (targetFolders.length > 0 && onBatchDeleteItems) {
                  void onBatchDeleteItems(targetArticles, targetFolders);
                } else if (targetArticles.length > 0 && onBatchDeleteArticles) {
                  void onBatchDeleteArticles(targetArticles);
                }
                setSelectedPaths([]);
              } else if (selectedPaths.length === 1) {
                const single = selectedPaths[0];
                if (folders.includes(single)) {
                  e.preventDefault();
                  void onDeleteFolder?.(single);
                  setSelectedPaths([]);
                } else {
                  const targetArt = articles.find((a) => a.relativePath === single) ?? activeArticle;
                  if (targetArt) {
                    e.preventDefault();
                    void onDeleteArticle(targetArt);
                    setSelectedPaths([]);
                  }
                }
              } else if (activeArticle) {
                e.preventDefault();
                void onDeleteArticle(activeArticle);
              }
            }
          }}
          onContextMenu={(e) => {
            if (sideTab !== 'files') return;
            e.preventDefault();
            setContextMenu({ type: 'empty', x: e.clientX, y: e.clientY });
          }}
          onDragOver={(e) => {
            if (sideTab !== 'files') return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (sideTab !== 'files') return;
            e.preventDefault();
            setDragOverFolder(null);
            const folderPath = e.dataTransfer.getData('application/x-vcat-folder');
            if (folderPath && folderPath.includes('/')) {
              void onMoveFolder(folderPath, '');
              return;
            }
            const sourcePath = e.dataTransfer.getData('text/plain');
            if (sourcePath && sourcePath.includes('/')) {
              void onMoveArticle(sourcePath, '');
            }
          }}
          onMouseDown={(e) => {
            if (e.button !== 0 || e.ctrlKey || sideTab !== 'files' || renamingPath || creatingItem) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest('input, textarea, [draggable="true"]')) return;
            const startX = e.clientX;
            const startY = e.clientY;
            let active = false;
            const onMove = (ev: MouseEvent) => {
              const dx = ev.clientX - startX;
              const dy = ev.clientY - startY;
              if (!active && Math.hypot(dx, dy) < 6) return;
              active = true;
              const left = Math.min(startX, ev.clientX);
              const top = Math.min(startY, ev.clientY);
              const width = Math.abs(dx);
              const height = Math.abs(dy);
              setMarqueeRect({ left, top, width, height });
              const container = fileListRef.current;
              if (container) {
                const hits: string[] = [];
                container.querySelectorAll<HTMLElement>('[data-article-path], [data-folder-path]').forEach((row) => {
                  const pathVal = row.dataset.articlePath || row.dataset.folderPath;
                  if (!pathVal) return;
                  const r = row.getBoundingClientRect();
                  const intersects =
                    r.right >= left &&
                    r.left <= left + width &&
                    r.bottom >= top &&
                    r.top <= top + height;
                  if (intersects) hits.push(pathVal);
                });
                setSelectedPaths(hits);
              }
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              if (active) {
                suppressNextClickRef.current = true;
                setTimeout(() => {
                  suppressNextClickRef.current = false;
                }, 80);
              } else if (!t?.closest('[data-article-path], [data-folder-path]')) {
                setSelectedPaths([]);
              }
              setMarqueeRect(null);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          ref={fileListRef}
          className="flex-1 overflow-y-auto px-1.5 py-2 outline-none"
        >
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
                onChange={(e) =>
                  setCreatingItem((prev) => (prev ? { ...prev, draft: e.target.value } : null))
                }
                onBlur={() => void confirmCreateItem()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    void confirmCreateItem();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    isConfirmingCreateRef.current = true;
                    setCreatingItem(null);
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
                          if (art) onOpenArticle(art);
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
                    onClick={(e) => handleArticleItemClick(e, art)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selectedPaths.includes(art.relativePath)) {
                        setSelectedPaths([art.relativePath]);
                        setLastClickedPath(art.relativePath);
                      }
                      setContextMenu({ type: 'file', x: e.clientX, y: e.clientY, article: art });
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
                onToggleDir={(dirPath) =>
                  setExpandedDirs((prev) => ({ ...prev, [dirPath]: !(prev[dirPath] ?? true) }))
                }
                onExpandDir={(dirPath) =>
                  setExpandedDirs((prev) => ({ ...prev, [dirPath]: true }))
                }
                onSetDragOverFolder={setDragOverFolder}
                onMoveFolder={onMoveFolder}
                onMoveArticle={onMoveArticle}
                onArticleClick={handleArticleItemClick}
                onFolderClick={handleFolderClick}
                onRenameStart={handleRenameStart}
                onRenameDraftChange={setRenameDraft}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={() => setRenamingPath(null)}
                onOpenFolderContextMenu={(x, y, folderPath) => {
                  if (!selectedPaths.includes(folderPath)) {
                    setSelectedPaths([folderPath]);
                    setLastClickedPath(folderPath);
                  }
                  setContextMenu({ type: 'folder', x, y, folderPath });
                }}
                onOpenFileContextMenu={(x, y, art) => {
                  if (!selectedPaths.includes(art.relativePath)) {
                    setSelectedPaths([art.relativePath]);
                    setLastClickedPath(art.relativePath);
                  }
                  setContextMenu({ type: 'file', x, y, article: art });
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
                  onClick={() => {
                    setActiveOutlineIdx(idx);
                    onJumpOutline(node.text, idx);
                  }}
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
        </div>

        {/* 底部工作区栏与可锁定操作面板 */}
        <div ref={sidebarPopoverRef} className="relative shrink-0">
          {sidebarMenuOpen && (
            <SidebarPopoverMenu
              pinned={sidebarMenuPinned}
              sortBy={sortBy}
              workspacePath={workspacePath}
              recentWorkspaces={recentWorkspaces}
              activeArticlePath={activeArticle?.relativePath ?? null}
              onClose={() => {
                setSidebarMenuPinned(false);
                setSidebarMenuOpen(false);
              }}
              onTogglePinned={() => setSidebarMenuPinned((p) => !p)}
              onCreateFile={() => startCreateItem('file')}
              onCreateFolder={() => startCreateItem('folder')}
              onOpenSearch={() => {
                onChangeSideTab('files');
                setFileSearchOpen(true);
              }}
              onSelectWorkspace={onSelectWorkspace}
              onRefreshWorkspace={onRefreshWorkspace}
              onSwitchRecentWorkspace={onSwitchRecentWorkspace}
              onSortChange={setSortBy}
            />
          )}

          <div className="flex h-[30px] shrink-0 items-center justify-between border-t border-[var(--border-color)] px-2 text-[11.5px] text-[var(--control-text-color)]">
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                title="新建空白文章"
                onClick={() => startCreateItem('file')}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="撤销新建文件 (Cmd+Z)"
                disabled={!canUndoFileOp}
                onClick={() => void onUndoFileOp?.()}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="恢复新建文件 (Cmd+Shift+Z)"
                disabled={!canRedoFileOp}
                onClick={() => void onRedoFileOp?.()}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              title="工作区操作与最近目录"
              onClick={() => setSidebarMenuOpen((v) => !v)}
              className="min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
            >
              {workspaceName}
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                title="更多目录操作"
                onClick={() => setSidebarMenuOpen((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="切换大纲视图"
                onClick={() => onChangeSideTab(sideTab === 'files' ? 'outline' : 'files')}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
              >
                <ListTree className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          onMouseDown={onStartResize}
          title="拖拽调整侧边栏宽度"
          className="group absolute top-0 -right-[4px] z-30 flex h-full w-[10px] cursor-col-resize items-center justify-center transition-colors hover:bg-[var(--accent)]/15"
        >
          <div className="h-11 w-[3.5px] rounded-full bg-[var(--control-text-color)]/25 transition-colors group-hover:bg-[var(--accent)]" />
        </div>
      </aside>

      {marqueeRect && (
        <div
          style={{
            left: `${marqueeRect.left}px`,
            top: `${marqueeRect.top}px`,
            width: `${marqueeRect.width}px`,
            height: `${marqueeRect.height}px`,
          }}
          className="pointer-events-none fixed z-50 rounded-sm border border-[var(--accent)] bg-[var(--accent)]/12"
        />
      )}

      <SidebarContextMenus
        menu={contextMenu}
        selectedPaths={selectedPaths}
        articles={articles}
        folders={folders}
        fileViewMode={fileViewMode}
        onCloseMenu={() => setContextMenu(null)}
        onClearSelection={() => setSelectedPaths([])}
        onOpenArticle={onOpenArticle}
        onStartCreateItem={startCreateItem}
        onOpenSearch={() => {
          onChangeSideTab('files');
          setFileSearchOpen(true);
        }}
        onChangeFileViewMode={setFileViewMode}
        onDuplicateArticle={onDuplicateArticle}
        onRenameStart={handleRenameStart}
        onDeleteArticle={onDeleteArticle}
        onBatchDeleteArticles={onBatchDeleteArticles}
        onDeleteFolder={onDeleteFolder}
        onBatchDeleteItems={onBatchDeleteItems}
        onRefreshWorkspace={onRefreshWorkspace}
      />
    </>
  );
}
