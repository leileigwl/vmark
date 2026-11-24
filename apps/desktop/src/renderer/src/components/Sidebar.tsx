import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleMeta, ArticleSearchResult, OutlineNode } from '@vcat/shared';
import { SidebarContentViews } from './sidebar/SidebarContentViews';
import { SidebarContextMenus, type SidebarContextMenu } from './sidebar/SidebarContextMenus';
import { SidebarFooterBar } from './sidebar/SidebarFooterBar';
import {
  buildDefaultCreateDraft,
  handleSidebarArticleClick,
  handleSidebarAsideKeyDown,
  handleSidebarFolderClick,
  handleSidebarListKeyDown,
  startSidebarMarqueeSelection,
} from './sidebar/sidebarInteractions';
import { SidebarTabHeader } from './sidebar/SidebarTabHeader';
import { buildFileTree, flattenVisibleTreeArticles } from './sidebar/sidebarTreeUtils';

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
  onOpenArticle: (art: ArticleMeta, searchKeyword?: string) => void;
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
  const isConfirmingCreateRef = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (selectedPaths.length <= 1) return;
    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target instanceof Element && target.closest('[data-sidebar-context-menu="1"]')) return;
      if (asideRef.current && target && !asideRef.current.contains(target)) {
        setSelectedPaths([]);
      }
    };
    window.addEventListener('mousedown', handleOutsideMouseDown);
    return () => window.removeEventListener('mousedown', handleOutsideMouseDown);
  }, [selectedPaths.length]);

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
      void window.electronAPI.searchArticlesContent(q).then(setContentSearchResults);
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
      ? articles.filter((a) => a.title.toLowerCase().includes(q) || a.relativePath.toLowerCase().includes(q))
      : [...articles];
    return sortBy === 'time'
      ? base.sort((a, b) => b.updatedAt - a.updatedAt)
      : base.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [articles, fileSearchQuery, sortBy]);

  const fileTree = useMemo(
    () => buildFileTree(filteredArticles, fileSearchQuery.trim() ? [] : folders),
    [filteredArticles, folders, fileSearchQuery]
  );

  const flatVisibleArticles = useMemo(
    () => (fileViewMode === 'list' ? filteredArticles : flattenVisibleTreeArticles(fileTree, expandedDirs)),
    [fileViewMode, filteredArticles, fileTree, expandedDirs]
  );

  const handleFolderClick = (e: React.MouseEvent, folderPath: string) =>
    handleSidebarFolderClick({ e, folderPath, suppressNextClick: suppressNextClickRef.current, setSelectedPaths, setLastClickedPath, setExpandedDirs });

  const handleArticleItemClick = (e: React.MouseEvent, article: ArticleMeta) =>
    handleSidebarArticleClick({ e, article, suppressNextClick: suppressNextClickRef.current, lastClickedPath, activeArticle, flatVisibleArticles, setSelectedPaths, setLastClickedPath, onOpenArticle });

  const startCreateItem = (type: 'file' | 'folder', parentDir?: string) => {
    onChangeSideTab('files');
    if (type === 'folder') setFileViewMode('tree');
    setCreatingItem({ type, parentDir, draft: buildDefaultCreateDraft(type, articles, folders, parentDir) });
  };

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
        ref={asideRef} data-vcat-file-tree={sideTab === 'files' ? '1' : '0'}
        onKeyDown={(e) =>
          handleSidebarAsideKeyDown({
            e,
            sideTab,
            renamingPath,
            creatingItem,
            onUndoFileOp,
            onRedoFileOp,
          })
        }
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

        <SidebarTabHeader
          sideTab={sideTab}
          articleCount={articles.length}
          fileSearchOpen={fileSearchOpen}
          fileSearchQuery={fileSearchQuery}
          onChangeSideTab={onChangeSideTab}
          onToggleSearch={() => {
            onChangeSideTab('files');
            setFileSearchOpen((v) => !v);
          }}
          onChangeSearchQuery={setFileSearchQuery}
          onCloseSearch={() => {
            setFileSearchQuery('');
            setFileSearchOpen(false);
          }}
        />

        <div
          tabIndex={0}
          ref={fileListRef}
          onKeyDown={(e) =>
            handleSidebarListKeyDown({
              e,
              sideTab,
              renamingPath,
              creatingItem,
              filteredArticles,
              activeArticle,
              expandedDirs,
              selectedPaths,
              articles,
              folders,
              setExpandedDirs,
              setSelectedPaths,
              onOpenArticle,
              onRenameStart: handleRenameStart,
              onDeleteArticle,
              onDeleteFolder,
              onBatchDeleteArticles,
              onBatchDeleteItems,
            })
          }
          onContextMenu={(e) => {
            if (sideTab !== 'files') return;
            e.preventDefault();
            setContextMenu({ type: 'empty', x: e.clientX, y: e.clientY });
          }}
          onDragOver={(e) => {
            if (sideTab === 'files') e.preventDefault();
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
          onMouseDown={(e) =>
            startSidebarMarqueeSelection({
              e,
              sideTab,
              renamingPath,
              creatingItem,
              fileListRef,
              suppressNextClickRef,
              setMarqueeRect,
              setSelectedPaths,
            })
          }
          className="vcat-no-scrollbar flex-1 overflow-y-auto px-1.5 py-2 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <SidebarContentViews
            sideTab={sideTab}
            creatingItem={creatingItem}
            isConfirmingCreateRef={isConfirmingCreateRef}
            onChangeCreatingDraft={(draft) =>
              setCreatingItem((prev) => (prev ? { ...prev, draft } : null))
            }
            onConfirmCreateItem={confirmCreateItem}
            onCancelCreateItem={() => setCreatingItem(null)}
            fileSearchQuery={fileSearchQuery}
            contentSearchResults={contentSearchResults}
            articles={articles}
            folders={folders}
            filteredArticles={filteredArticles}
            fileTree={fileTree}
            fileViewMode={fileViewMode}
            activeArticle={activeArticle}
            selectedPaths={selectedPaths}
            expandedDirs={expandedDirs}
            dragOverFolder={dragOverFolder}
            renamingPath={renamingPath}
            renameDraft={renameDraft}
            outlineNodes={outlineNodes}
            activeOutlineIdx={activeOutlineIdx}
            onOpenArticle={onOpenArticle}
            onArticleItemClick={handleArticleItemClick}
            onFolderClick={handleFolderClick}
            onSetSelectedPaths={setSelectedPaths}
            onSetLastClickedPath={setLastClickedPath}
            onSetContextMenu={setContextMenu}
            onToggleDir={(dirPath) =>
              setExpandedDirs((prev) => ({ ...prev, [dirPath]: !(prev[dirPath] ?? true) }))
            }
            onExpandDir={(dirPath) =>
              setExpandedDirs((prev) => ({ ...prev, [dirPath]: true }))
            }
            onSetDragOverFolder={setDragOverFolder}
            onMoveFolder={onMoveFolder}
            onMoveArticle={onMoveArticle}
            onRenameStart={handleRenameStart}
            onRenameDraftChange={setRenameDraft}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingPath(null)}
            onSelectOutline={(text, idx) => {
              setActiveOutlineIdx(idx);
              onJumpOutline(text, idx);
            }}
          />
        </div>

        <SidebarFooterBar
          sidebarPopoverRef={sidebarPopoverRef}
          sidebarMenuOpen={sidebarMenuOpen}
          sidebarMenuPinned={sidebarMenuPinned}
          sortBy={sortBy}
          workspaceName={workspaceName}
          workspacePath={workspacePath}
          recentWorkspaces={recentWorkspaces}
          activeArticlePath={activeArticle?.relativePath ?? null}
          sideTab={sideTab}
          canUndoFileOp={canUndoFileOp}
          canRedoFileOp={canRedoFileOp}
          onCloseMenu={() => {
            setSidebarMenuPinned(false);
            setSidebarMenuOpen(false);
          }}
          onTogglePinned={() => setSidebarMenuPinned((p) => !p)}
          onToggleMenu={() => setSidebarMenuOpen((v) => !v)}
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
          onUndoFileOp={onUndoFileOp}
          onRedoFileOp={onRedoFileOp}
          onToggleSideTab={() => onChangeSideTab(sideTab === 'files' ? 'outline' : 'files')}
        />

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
