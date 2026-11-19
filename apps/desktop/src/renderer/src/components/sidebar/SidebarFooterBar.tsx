import type { RefObject } from 'react';
import { ListTree, MoreVertical, Plus, Redo2, Undo2 } from 'lucide-react';
import { SidebarPopoverMenu } from './SidebarPopoverMenu';

interface SidebarFooterBarProps {
  sidebarPopoverRef: RefObject<HTMLDivElement>;
  sidebarMenuOpen: boolean;
  sidebarMenuPinned: boolean;
  sortBy: 'name' | 'time';
  workspaceName: string;
  workspacePath: string | null;
  recentWorkspaces: string[];
  activeArticlePath: string | null;
  sideTab: 'files' | 'outline';
  canUndoFileOp: boolean;
  canRedoFileOp: boolean;
  onCloseMenu: () => void;
  onTogglePinned: () => void;
  onToggleMenu: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onOpenSearch: () => void;
  onSelectWorkspace: () => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onSwitchRecentWorkspace: (dir: string) => Promise<void>;
  onSortChange: (sort: 'name' | 'time') => void;
  onUndoFileOp?: () => Promise<void>;
  onRedoFileOp?: () => Promise<void>;
  onToggleSideTab: () => void;
}

/** Bottom workspace action bar and popover trigger for Sidebar. */
export function SidebarFooterBar({
  sidebarPopoverRef,
  sidebarMenuOpen,
  sidebarMenuPinned,
  sortBy,
  workspaceName,
  workspacePath,
  recentWorkspaces,
  activeArticlePath,
  canUndoFileOp,
  canRedoFileOp,
  onCloseMenu,
  onTogglePinned,
  onToggleMenu,
  onCreateFile,
  onCreateFolder,
  onOpenSearch,
  onSelectWorkspace,
  onRefreshWorkspace,
  onSwitchRecentWorkspace,
  onSortChange,
  onUndoFileOp,
  onRedoFileOp,
  onToggleSideTab,
}: SidebarFooterBarProps) {
  return (
    <div ref={sidebarPopoverRef} className="relative shrink-0">
      {sidebarMenuOpen && (
        <SidebarPopoverMenu
          pinned={sidebarMenuPinned}
          sortBy={sortBy}
          workspacePath={workspacePath}
          recentWorkspaces={recentWorkspaces}
          activeArticlePath={activeArticlePath}
          onClose={onCloseMenu}
          onTogglePinned={onTogglePinned}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onOpenSearch={onOpenSearch}
          onSelectWorkspace={onSelectWorkspace}
          onRefreshWorkspace={onRefreshWorkspace}
          onSwitchRecentWorkspace={onSwitchRecentWorkspace}
          onSortChange={onSortChange}
        />
      )}

      <div className="flex h-[30px] shrink-0 items-center justify-between border-t border-[var(--border-color)] px-2 text-[11.5px] text-[var(--control-text-color)]">
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="新建空白文章"
            onClick={onCreateFile}
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
          onClick={onToggleMenu}
          className="min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
        >
          {workspaceName}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="更多目录操作"
            onClick={onToggleMenu}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="切换大纲视图"
            onClick={onToggleSideTab}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
          >
            <ListTree className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
