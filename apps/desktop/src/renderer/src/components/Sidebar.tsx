import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  ListTree,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Search,
} from 'lucide-react';
import type { ArticleMeta, ArticleSearchResult, OutlineNode } from '@vcat/shared';
import {
  SidebarContextMenus,
  type EmptyContextMenuState,
  type FileContextMenuState,
} from './sidebar/SidebarContextMenus';

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  article?: ArticleMeta;
  children: TreeNode[];
}

function buildFileTree(articles: ArticleMeta[], folders: string[] = []): TreeNode[] {
  const root: TreeNode[] = [];
  const ensureDirPath = (dirPath: string) => {
    const parts = dirPath.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const nodePath = parts.slice(0, i + 1).join('/');
      let existing = current.find((n) => n.name === part && n.isDir);
      if (!existing) {
        existing = { name: part, path: nodePath, isDir: true, children: [] };
        current.push(existing);
      }
      current = existing.children;
    }
  };
  for (const dir of folders) ensureDirPath(dir);

  for (const art of articles) {
    const parts = art.relativePath.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const nodePath = parts.slice(0, i + 1).join('/');
      let existing = current.find((n) => n.name === part && n.isDir === !isLast);
      if (!existing) {
        existing = {
          name: part,
          path: nodePath,
          isDir: !isLast,
          article: isLast ? art : undefined,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => (n.isDir ? { ...n, children: sortNodes(n.children) } : n))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  return sortNodes(root);
}

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
  onDuplicateArticle: (art: ArticleMeta) => Promise<void>;
  onMoveArticle: (oldPath: string, targetFolder: string) => Promise<void>;
  onMoveFolder: (oldFolder: string, targetParent: string) => Promise<void>;
  onSelectWorkspace: () => Promise<void>;
  onSwitchRecentWorkspace: (dir: string) => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onJumpOutline: (headingText: string, index: number) => void;
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
  onDuplicateArticle,
  onMoveArticle,
  onMoveFolder,
  onSelectWorkspace,
  onSwitchRecentWorkspace,
  onRefreshWorkspace,
  onJumpOutline,
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
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    article: ArticleMeta;
  } | null>(null);
  const [emptyContextMenu, setEmptyContextMenu] = useState<{ x: number; y: number } | null>(null);

  const sidebarPopoverRef = useRef<HTMLDivElement>(null);

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
    if (!fileContextMenu && !emptyContextMenu) return;
    const close = () => {
      setFileContextMenu(null);
      setEmptyContextMenu(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [fileContextMenu, emptyContextMenu]);

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

  function handleArticleItemClick(e: React.MouseEvent, article: ArticleMeta) {
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
    if (type === 'file') {
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
    if (!creatingItem) return;
    const { type, parentDir, draft } = creatingItem;
    const raw = draft.trim();
    setCreatingItem(null);
    if (!raw) return;
    if (type === 'folder') {
      const rel = parentDir ? `${parentDir}/${raw}` : raw;
      await onCreateFolder(rel, parentDir);
      setExpandedDirs((prev) => ({ ...prev, [rel]: true }));
      return;
    }
    await onCreateFile(raw, parentDir);
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

  function renderTreeNodes(nodes: TreeNode[], depth = 0) {
    return nodes.map((node) => {
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
              onClick={() => setExpandedDirs((prev) => ({ ...prev, [node.path]: !isOpen }))}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverFolder(node.path);
              }}
              onDragLeave={() => setDragOverFolder((prev) => (prev === node.path ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverFolder(null);
                const folderPath = e.dataTransfer.getData('application/x-vcat-folder');
                if (folderPath) {
                  void onMoveFolder(folderPath, node.path);
                  return;
                }
                const sourcePath = e.dataTransfer.getData('text/plain');
                if (sourcePath) {
                  void onMoveArticle(sourcePath, node.path).then(() => {
                    setExpandedDirs((prev) => ({ ...prev, [node.path]: true }));
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
            {isOpen && renderTreeNodes(node.children, depth + 1)}
          </div>
        );
      }

      const article = node.article;
      const isMultiSelected = Boolean(
        article && selectedPaths.length > 1 && selectedPaths.includes(article.relativePath)
      );
      const isSelected = isMultiSelected || activeArticle?.relativePath === article?.relativePath;
      const isRenaming = renamingPath === article?.relativePath;
      return (
        <div
          key={node.path}
          onContextMenu={(e) => {
            if (!article) return;
            e.preventDefault();
            e.stopPropagation();
            if (!selectedPaths.includes(article.relativePath)) {
              setSelectedPaths([article.relativePath]);
              setLastClickedPath(article.relativePath);
            }
            setFileContextMenu({ x: e.clientX, y: e.clientY, article });
          }}
        >
          {isRenaming && article ? (
            <div style={{ paddingLeft: `${22 + depth * 12}px` }} className="pr-2 py-[2px]">
              <input
                type="text"
                autoFocus
                onFocus={(e) => {
                  const dotIdx = e.currentTarget.value.lastIndexOf('.');
                  if (dotIdx > 0) e.currentTarget.setSelectionRange(0, dotIdx);
                  else e.currentTarget.select();
                }}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => void handleRenameSubmit(article.relativePath)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleRenameSubmit(article.relativePath);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenamingPath(null);
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
                if (article) handleArticleItemClick(e, article);
              }}
              onDoubleClick={() => {
                if (article) handleRenameStart(article);
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
    });
  }

  return (
    <>
      <aside
        style={{
          width: open ? `${width}px` : '0px',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
        }}
        className={`relative flex h-screen shrink-0 flex-col overflow-hidden bg-[var(--side-bar-bg-color)] select-none ${
          open ? 'border-r border-[var(--border-color)]' : 'border-r-0'
        } ${!isResizing ? 'transition-[width,opacity] duration-200 ease-out' : ''}`}
      >
        <div className="app-drag flex h-[38px] shrink-0 items-center justify-end px-3" />

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
            if (sideTab !== 'files' || renamingPath || filteredArticles.length === 0) return;
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
              if (activeArticle) {
                e.preventDefault();
                void onDeleteArticle(activeArticle);
              }
            }
          }}
          onContextMenu={(e) => {
            if (sideTab !== 'files') return;
            e.preventDefault();
            setFileContextMenu(null);
            setEmptyContextMenu({ x: e.clientX, y: e.clientY });
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
                    void confirmCreateItem();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setCreatingItem(null);
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
                const isSelected =
                  (selectedPaths.length > 1 && selectedPaths.includes(art.relativePath)) ||
                  activeArticle?.relativePath === art.relativePath;
                return (
                  <button
                    key={art.relativePath}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', art.relativePath)}
                    onClick={(e) => handleArticleItemClick(e, art)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selectedPaths.includes(art.relativePath)) {
                        setSelectedPaths([art.relativePath]);
                        setLastClickedPath(art.relativePath);
                      }
                      setFileContextMenu({ x: e.clientX, y: e.clientY, article: art });
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
              renderTreeNodes(fileTree)
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
            <div className="absolute bottom-8 left-2 right-2 z-40 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1.5 text-[12px] text-[var(--text-main)] shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between px-3 pb-1 text-[11px] font-semibold text-[var(--control-text-color)]">
                <span>操作</span>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarMenuPinned(false);
                    setSidebarMenuOpen(false);
                  }}
                  className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  startCreateItem('file');
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                新建文件
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  startCreateItem('folder');
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                新建文件夹
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  onChangeSideTab('files');
                  setFileSearchOpen(true);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                搜索（文件名 / 正文）
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void window.electronAPI.showInFinder(activeArticle?.relativePath);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                在 Finder 中显示
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void onSelectWorkspace();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                打开文件夹...
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void onRefreshWorkspace();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                刷新
              </button>

              <div className="my-1 flex items-center justify-between border-t border-[var(--border-color)] px-3 pt-1 text-[11px] text-[var(--control-text-color)]">
                <span>排序</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSortBy('name')}
                    className={`rounded px-1.5 py-0.5 ${
                      sortBy === 'name' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    A-Z
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('time')}
                    className={`rounded px-1.5 py-0.5 ${
                      sortBy === 'time' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    最近
                  </button>
                </div>
              </div>

              {recentWorkspaces.length > 0 && (
                <div className="border-t border-[var(--border-color)] pt-1">
                  <div className="px-3 pb-0.5 text-[11px] font-semibold text-[var(--control-text-color)]">
                    最近使用的目录
                  </div>
                  {recentWorkspaces.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                        void onSwitchRecentWorkspace(dir);
                      }}
                      className="flex w-full items-center justify-between px-3 py-1 text-left hover:bg-[var(--bg-hover)]"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Folder className="h-3 w-3 shrink-0 text-[var(--control-text-color)]" />
                        <span className="truncate">{dir.split('/').pop() || dir}</span>
                      </span>
                      {dir === workspacePath && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-1 flex items-center justify-end border-t border-[var(--border-color)] px-2.5 pt-1">
                <button
                  type="button"
                  title={sidebarMenuPinned ? '取消锁定面板' : '锁定面板（不自动关闭）'}
                  onClick={() => setSidebarMenuPinned((p) => !p)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                    sidebarMenuPinned
                      ? 'bg-[var(--accent)]/15 font-medium text-[var(--accent)]'
                      : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {sidebarMenuPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                  <span>{sidebarMenuPinned ? '已锁定' : '锁定面板'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex h-[30px] shrink-0 items-center justify-between border-t border-[var(--border-color)] px-2 text-[11.5px] text-[var(--control-text-color)]">
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

      <SidebarContextMenus
        fileContextMenu={fileContextMenu}
        emptyContextMenu={emptyContextMenu}
        selectedPaths={selectedPaths}
        articles={articles}
        fileViewMode={fileViewMode}
        onCloseFileMenu={() => setFileContextMenu(null)}
        onCloseEmptyMenu={() => setEmptyContextMenu(null)}
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
        onRefreshWorkspace={onRefreshWorkspace}
      />
    </>
  );
}
