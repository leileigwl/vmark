import type { ReactNode } from 'react';
import { Clock, Edit3, Eye, PanelLeft, Send, Settings, Table2 } from 'lucide-react';
import type { ArticleMeta } from '@vcat/shared';
import { Button, cn } from '../ui';

interface TopBarProps {
  activeView: 'editor' | 'manager' | 'settings';
  sidebarOpen: boolean;
  isFullscreen: boolean;
  readOnly: boolean;
  activeArticle: ArticleMeta | null;
  liveWordCount: number;
  saveState: string;
  updateSlot?: ReactNode;
  onToggleSidebar: () => void;
  onToggleReadOnly: () => void;
  onOpenQuickOpen: () => void;
  onSetActiveView: (view: 'editor' | 'manager' | 'settings') => void;
  onOpenPublishModal: () => void;
}

/** 顶栏图标按钮：28px 见方，颜色全部取主题令牌（随浅色 / 深色主题切换）。 */
const ICON_BUTTON = 'size-7 rounded-md [&_svg]:size-3.5';
/** 当前激活的视图 / 只读状态：主题强调色的浅底 + 强调色文字。 */
const ACTIVE = 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary';

/** 36px macOS-native unified top toolbar with word count, save status, and view switchers. */
export function TopBar({
  activeView,
  sidebarOpen,
  isFullscreen,
  readOnly,
  activeArticle,
  liveWordCount,
  saveState,
  updateSlot,
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
      className={cn(
        'relative app-drag flex h-[36px] shrink-0 select-none items-center justify-between border-b bg-canvas pr-5',
        activeView === 'editor' ? 'border-transparent' : 'border-line',
        reserveTrafficLights ? 'pl-[76px]' : 'pl-3'
      )}
    >
      <div className="app-no-drag flex items-center gap-1.5">
        <Button variant="ghost" size="icon" className={ICON_BUTTON} title={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'} onClick={onToggleSidebar}>
          <PanelLeft />
        </Button>
        <Button variant="ghost" size="icon" className={ICON_BUTTON} title="打开最近文件 / 快速打开 (⇧⌘O)" onClick={onOpenQuickOpen}>
          <Clock />
        </Button>
        {activeView !== 'editor' && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-primary hover:text-primary" onClick={() => onSetActiveView('editor')}>
            ← 返回写作台
          </Button>
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[40%] truncate text-center text-[12.5px] font-medium text-muted">
        {activeView === 'editor'
          ? activeArticle?.relativePath ?? 'Vmark（维记）'
          : activeView === 'manager'
            ? '文章管理台'
            : '偏好设置'}
      </div>

      <div className="app-no-drag flex shrink-0 items-center gap-1 text-xs text-muted">
        <span className="mr-2 text-[11.5px] tabular-nums opacity-85">
          {liveWordCount} 词 · {saveState}
        </span>
        {updateSlot}
        {activeView === 'editor' && (
          <Button
            variant="ghost"
            size="sm"
            title={readOnly ? '当前为只读模式，点击切换回正常编辑模式' : '当前为正常编辑模式，点击切换为只读模式'}
            onClick={onToggleReadOnly}
            className={cn('mr-1 h-7 gap-1 px-2 text-[11.5px] [&_svg]:size-3', readOnly && ACTIVE)}
          >
            {readOnly ? <Eye /> : <Edit3 />}
            <span>{readOnly ? '只读' : '编辑'}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="文章管理台"
          onClick={() => onSetActiveView(activeView === 'manager' ? 'editor' : 'manager')}
          className={cn(ICON_BUTTON, activeView === 'manager' && ACTIVE)}
        >
          <Table2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="偏好设置 (图床 / 平台 / GitHub)"
          onClick={() => onSetActiveView(activeView === 'settings' ? 'editor' : 'settings')}
          className={cn(ICON_BUTTON, activeView === 'settings' && ACTIVE)}
        >
          <Settings />
        </Button>
        <Button variant="primary" size="sm" className="ml-1.5 h-7 gap-1 text-[12px] [&_svg]:size-3" onClick={onOpenPublishModal}>
          <Send />
          发布
        </Button>
      </div>
    </header>
  );
}
