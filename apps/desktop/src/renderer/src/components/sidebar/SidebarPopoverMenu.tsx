import { Folder, Pin, PinOff } from 'lucide-react';
import { getRevealInFileManagerLabel } from '@vcat/shared';

interface SidebarPopoverMenuProps {
  pinned: boolean;
  sortBy: 'name' | 'time';
  workspacePath: string | null;
  recentWorkspaces: string[];
  activeArticlePath?: string | null;
  onClose: () => void;
  onTogglePinned: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onOpenSearch: () => void;
  onSelectWorkspace: () => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onSwitchRecentWorkspace: (dir: string) => Promise<void>;
  onSortChange: (sort: 'name' | 'time') => void;
}

/** Bottom-left pinnable action popover in the sidebar. */
export function SidebarPopoverMenu({
  pinned,
  sortBy,
  workspacePath,
  recentWorkspaces,
  activeArticlePath,
  onClose,
  onTogglePinned,
  onCreateFile,
  onCreateFolder,
  onOpenSearch,
  onSelectWorkspace,
  onRefreshWorkspace,
  onSwitchRecentWorkspace,
  onSortChange,
}: SidebarPopoverMenuProps) {
  const autoClose = () => {
    if (!pinned) onClose();
  };

  return (
    <div className="absolute bottom-8 left-2 right-2 z-40 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/95 py-1.5 text-[12px] text-[var(--text-main)] shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between px-3 pb-1 text-[11px] font-semibold text-[var(--control-text-color)]">
        <span>操作</span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-[var(--bg-hover)]">
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          autoClose();
          onCreateFile();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
      >
        新建文件
      </button>
      <button
        type="button"
        onClick={() => {
          autoClose();
          onCreateFolder();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
      >
        新建文件夹
      </button>
      <button
        type="button"
        onClick={() => {
          autoClose();
          onOpenSearch();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
      >
        搜索（文件名 / 正文）
      </button>
      <button
        type="button"
        onClick={() => {
          autoClose();
          void window.electronAPI.showInFinder(activeArticlePath ?? undefined);
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
      >
        {getRevealInFileManagerLabel()}
      </button>
      <button
        type="button"
        onClick={() => {
          autoClose();
          void onSelectWorkspace();
        }}
        className="block w-full px-3.5 py-1 text-left hover:bg-[var(--bg-hover)]"
      >
        打开文件夹...
      </button>
      <button
        type="button"
        onClick={() => {
          autoClose();
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
            onClick={() => onSortChange('name')}
            className={`rounded px-1.5 py-0.5 ${
              sortBy === 'name' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'hover:bg-[var(--bg-hover)]'
            }`}
          >
            A-Z
          </button>
          <button
            type="button"
            onClick={() => onSortChange('time')}
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
                autoClose();
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
          title={pinned ? '取消锁定面板' : '锁定面板（不自动关闭）'}
          onClick={onTogglePinned}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
            pinned
              ? 'bg-[var(--accent)]/15 font-medium text-[var(--accent)]'
              : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {pinned ? '已锁定' : '锁定'}
        </button>
      </div>
    </div>
  );
}
