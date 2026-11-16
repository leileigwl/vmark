import { Clock, Edit3, Eye, PanelLeft, Send, Settings, Table2 } from 'lucide-react';
import type { ArticleMeta } from '@vcat/shared';

interface TopBarProps {
  activeView: 'editor' | 'manager' | 'settings';
  sidebarOpen: boolean;
  isFullscreen: boolean;
  readOnly: boolean;
  activeArticle: ArticleMeta | null;
  liveWordCount: number;
  saveState: string;
  onToggleSidebar: () => void;
  onToggleReadOnly: () => void;
  onOpenQuickOpen: () => void;
  onSetActiveView: (view: 'editor' | 'manager' | 'settings') => void;
  onOpenPublishModal: () => void;
}

/** 36px macOS-native unified top toolbar with word count, save status, and view switchers. */
export function TopBar({
  activeView,
  sidebarOpen,
  isFullscreen,
  readOnly,
  activeArticle,
  liveWordCount,
  saveState,
  onToggleSidebar,
  onToggleReadOnly,
  onOpenQuickOpen,
  onSetActiveView,
  onOpenPublishModal,
}: TopBarProps) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const reserveTrafficLights = !sidebarOpen && isMac && !isFullscreen;

  return (
    <header
      className={`relative app-drag flex h-[36px] shrink-0 items-center justify-between bg-[var(--bg-main)] pr-5 select-none ${
        activeView === 'editor' ? 'border-b border-transparent' : 'border-b border-[var(--border-color)]'
      } ${reserveTrafficLights ? 'pl-[76px]' : 'pl-3'}`}
    >
      <div className="app-no-drag flex items-center gap-1.5">
        <button
          type="button"
          title={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}
          onClick={onToggleSidebar}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="打开最近文件 / 快速打开 (⇧⌘O)"
          onClick={onOpenQuickOpen}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        {activeView !== 'editor' && (
          <button
            type="button"
            onClick={() => onSetActiveView('editor')}
            className="rounded px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            ← 返回写作台
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[40%] truncate text-center text-[12.5px] font-medium text-[var(--control-text-color)]">
        {activeView === 'editor'
          ? activeArticle?.relativePath ?? 'Vmark（维记）'
          : activeView === 'manager'
            ? '文章管理台'
            : '偏好设置'}
      </div>

      <div className="app-no-drag flex shrink-0 items-center gap-1 text-xs text-[var(--control-text-color)]">
        <span className="mr-2 text-[11.5px] tabular-nums opacity-85">
          {liveWordCount} 词 · {saveState}
        </span>
        {activeView === 'editor' && (
          <button
            type="button"
            title={readOnly ? '当前为只读模式，点击切换回正常编辑模式' : '当前为正常编辑模式，点击切换为只读模式'}
            onClick={onToggleReadOnly}
            className={`mr-1 flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition ${
              readOnly
                ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
            }`}
          >
            {readOnly ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
            <span>{readOnly ? '只读' : '编辑'}</span>
          </button>
        )}
        <button
          type="button"
          title="文章管理台"
          onClick={() => onSetActiveView(activeView === 'manager' ? 'editor' : 'manager')}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
            activeView === 'manager'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
              : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
          }`}
        >
          <Table2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="偏好设置 (图床 / 平台 / GitHub)"
          onClick={() => onSetActiveView(activeView === 'settings' ? 'editor' : 'settings')}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
            activeView === 'settings'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
              : 'text-[var(--control-text-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenPublishModal}
          className="ml-1.5 flex h-7 items-center gap-1 rounded-md bg-[#007aff] px-2.5 text-[12px] font-medium text-white shadow-2xs transition hover:bg-[#0066d6]"
        >
          <Send className="h-3 w-3" />
          分发
        </button>
      </div>
    </header>
  );
}
