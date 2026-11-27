import { useLayoutEffect, useRef, useState } from 'react';
import { getRevealInFileManagerLabel, type ArticleMeta } from '@vcat/shared';
import type { SidebarExternalFileActions } from '../../features/workspace-tree';

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
  fileActions?: SidebarExternalFileActions;
}

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
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - width - pad);
    let top = anchor.y;
    if (top + height > window.innerHeight - pad) {
      top = Math.max(pad, anchor.y - height);
      if (top + height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - height - pad);
    }
    setPos({ left, top });
  }, [anchor]);

  return { menuRef, pos };
}

function MenuBtn({
  label,
  onClick,
  danger,
  muted,
  checked,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  muted?: boolean;
  checked?: boolean;
}) {
  const cls = danger
    ? 'font-medium text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white'
    : muted
      ? 'text-[var(--control-text-color)] hover:bg-[#007aff] hover:text-white'
      : 'hover:bg-[#007aff] hover:text-white';
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-between px-3.5 py-1 text-left ${cls}`}>
      <span>{label}</span>
      {checked ? <span>✓</span> : null}
    </button>
  );
}

const Divider = () => <div className="my-1 border-t border-[var(--border-color)]" />;

export function SidebarContextMenus(props: SidebarContextMenusProps) {
  const {
    menu, selectedPaths, articles, folders, fileViewMode, onCloseMenu, onClearSelection,
    onOpenArticle, onStartCreateItem, onOpenSearch, onChangeFileViewMode, onDuplicateArticle,
    onRenameStart, onDeleteArticle, onBatchDeleteArticles, onDeleteFolder, onBatchDeleteItems,
    onRefreshWorkspace, fileActions,
  } = props;
  const { menuRef, pos } = useClampedPosition(menu);
  if (!menu) return null;

  const isBatch = selectedPaths.length > 1;
  const runBatchDelete = () => {
    onCloseMenu();
    const fileTargets = articles.filter((a) => selectedPaths.includes(a.relativePath));
    const folderTargets = folders.filter((f) => selectedPaths.includes(f));
    onClearSelection();
    if (folderTargets.length > 0 && onBatchDeleteItems) void onBatchDeleteItems(fileTargets, folderTargets);
    else if (onBatchDeleteArticles && fileTargets.length > 0) void onBatchDeleteArticles(fileTargets);
  };

  const renderBatchMenu = (pasteDir: string, showCopyPaths: boolean) => (
    <>
      <div className="px-3.5 py-1 text-[11px] font-medium text-[var(--control-text-color)]">已选中 {selectedPaths.length} 项</div>
      <MenuBtn label={`批量删除 (${selectedPaths.length} 项)...`} danger onClick={runBatchDelete} />
      <MenuBtn label={`复制 (${selectedPaths.length} 项)`} onClick={() => { onCloseMenu(); void fileActions?.onCopyFiles(selectedPaths); }} />
      <MenuBtn label="粘贴到当前目录" onClick={() => { onCloseMenu(); void fileActions?.onPasteFiles(pasteDir); }} />
      {showCopyPaths ? (
        <MenuBtn
          label={`批量复制路径 (${selectedPaths.length} 篇)`}
          onClick={() => {
            const fullPaths = articles.filter((a) => selectedPaths.includes(a.relativePath)).map((a) => a.fullPath).join('\n');
            void navigator.clipboard.writeText(fullPaths);
            onCloseMenu();
          }}
        />
      ) : null}
      <Divider />
      <MenuBtn label="取消多选" muted onClick={() => { onClearSelection(); onCloseMenu(); }} />
    </>
  );

  const renderViewToggle = () => (
    <>
      <MenuBtn label="文档列表" checked={fileViewMode === 'list'} onClick={() => { onChangeFileViewMode(fileViewMode === 'list' ? 'tree' : 'list'); onCloseMenu(); }} />
      <MenuBtn label="文档树" checked={fileViewMode === 'tree'} onClick={() => { onChangeFileViewMode('tree'); onCloseMenu(); }} />
    </>
  );

  let body: React.ReactNode;
  if (menu.type === 'file') {
    const article = menu.article;
    const parentDir = article.relativePath.includes('/') ? article.relativePath.split('/').slice(0, -1).join('/') : undefined;
    body = isBatch ? renderBatchMenu(parentDir ?? '', true) : (
      <>
        <MenuBtn label="打开" onClick={() => { onOpenArticle(article); onCloseMenu(); }} />
        <MenuBtn label="新建文件" onClick={() => { onCloseMenu(); onStartCreateItem('file', parentDir); }} />
        <MenuBtn label="新建文件夹" onClick={() => { onCloseMenu(); onStartCreateItem('folder', parentDir); }} />
        <MenuBtn label="搜索" onClick={() => { onCloseMenu(); onOpenSearch(); }} />
        <Divider />
        {renderViewToggle()}
        <Divider />
        <MenuBtn label="复制" onClick={() => { onCloseMenu(); void fileActions?.onCopyFiles([article.relativePath]); }} />
        <MenuBtn label="粘贴" onClick={() => { onCloseMenu(); void fileActions?.onPasteFiles(parentDir ?? ''); }} />
        <MenuBtn label="创建副本" onClick={() => { onCloseMenu(); void onDuplicateArticle(article); }} />
        <MenuBtn label="重命名..." onClick={() => { onCloseMenu(); onRenameStart(article); }} />
        <MenuBtn label="删除..." danger onClick={() => { onCloseMenu(); void onDeleteArticle(article); }} />
        <Divider />
        <MenuBtn label="复制文件路径" onClick={() => { void navigator.clipboard.writeText(article.fullPath); onCloseMenu(); }} />
        <MenuBtn label={getRevealInFileManagerLabel()} onClick={() => { void window.electronAPI.showInFinder(article.relativePath); onCloseMenu(); }} />
      </>
    );
  } else if (menu.type === 'folder') {
    const folderPath = menu.folderPath;
    body = isBatch ? renderBatchMenu(folderPath, false) : (
      <>
        <MenuBtn label="新建文件" onClick={() => { onCloseMenu(); onStartCreateItem('file', folderPath); }} />
        <MenuBtn label="新建文件夹" onClick={() => { onCloseMenu(); onStartCreateItem('folder', folderPath); }} />
        <Divider />
        <MenuBtn label="复制" onClick={() => { onCloseMenu(); void fileActions?.onCopyFiles([folderPath]); }} />
        <MenuBtn label="粘贴到此文件夹" onClick={() => { onCloseMenu(); void fileActions?.onPasteFiles(folderPath); }} />
        <Divider />
        <MenuBtn label="删除文件夹..." danger onClick={() => { onCloseMenu(); void onDeleteFolder?.(folderPath); }} />
        <Divider />
        <MenuBtn label={getRevealInFileManagerLabel()} onClick={() => { void window.electronAPI.showInFinder(folderPath); onCloseMenu(); }} />
      </>
    );
  } else {
    body = (
      <>
        <MenuBtn label="新建文件" onClick={() => { onCloseMenu(); onStartCreateItem('file'); }} />
        <MenuBtn label="新建文件夹" onClick={() => { onCloseMenu(); onStartCreateItem('folder'); }} />
        <MenuBtn label="打开文件..." onClick={() => { onCloseMenu(); void fileActions?.onOpenExternalFile(); }} />
        <MenuBtn label="粘贴" onClick={() => { onCloseMenu(); void fileActions?.onPasteFiles(''); }} />
        <Divider />
        <MenuBtn label="搜索" onClick={() => { onCloseMenu(); onOpenSearch(); }} />
        <MenuBtn label="刷新" onClick={() => { onCloseMenu(); void onRefreshWorkspace(); }} />
        <MenuBtn label={getRevealInFileManagerLabel()} onClick={() => { void window.electronAPI.showInFinder(); onCloseMenu(); }} />
        <Divider />
        {renderViewToggle()}
      </>
    );
  }

  return (
    <div
      ref={menuRef}
      data-sidebar-context-menu="1"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onClick={(e) => e.stopPropagation()}
      className={`fixed z-50 max-h-[calc(100vh-20px)] ${menu.type === 'empty' ? 'w-44' : 'w-48'} overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1 text-[12.5px] text-[var(--text-main)] shadow-xl backdrop-blur-md`}
    >
      {body}
    </div>
  );
}
