import { Search } from 'lucide-react';

interface SidebarTabHeaderProps {
  sideTab: 'files' | 'outline';
  articleCount: number;
  fileSearchOpen: boolean;
  fileSearchQuery: string;
  onChangeSideTab: (tab: 'files' | 'outline') => void;
  onToggleSearch: () => void;
  onChangeSearchQuery: (q: string) => void;
  onCloseSearch: () => void;
}

/** Top tab switcher (`文件` / `大纲`) and collapsible content search bar for Sidebar. */
export function SidebarTabHeader({
  sideTab,
  articleCount,
  fileSearchOpen,
  fileSearchQuery,
  onChangeSideTab,
  onToggleSearch,
  onChangeSearchQuery,
  onCloseSearch,
}: SidebarTabHeaderProps) {
  return (
    <>
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
          文件 ({articleCount})
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
          onClick={onToggleSearch}
          className={`ml-1 rounded p-1 ${
            fileSearchOpen ? 'text-[var(--accent)]' : 'text-[var(--control-text-color)] hover:text-[var(--text-main)]'
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
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCloseSearch();
            }}
            className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      )}
    </>
  );
}
