import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  Image as ImageIcon,
  ListTree,
  MoreVertical,
  Palette,
  PanelLeft,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Settings,
  Table2,
} from 'lucide-react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import { countWords, extractOutline } from '@vcat/core';
import type {
  ArticleMeta,
  ArticleSearchResult,
  GitStatusInfo,
  ImageBedConfig,
  PlatformId,
  ThemeId,
} from '@vcat/shared';
import { VditorEditor, type VditorEditorHandle } from './components/VditorEditor';

type MainView = 'editor' | 'manager' | 'settings';
type SideTab = 'files' | 'outline';
type SettingCategory = 'image' | 'theme' | 'platforms' | 'github';

const PLATFORM_LOGIN_URLS: Partial<Record<PlatformId, string>> = {
  weixin: 'https://mp.weixin.qq.com/',
  cnblogs: 'https://account.cnblogs.com/signin',
  linuxdo: 'https://linux.do/login',
  juejin: 'https://juejin.cn/',
  csdn: 'https://passport.csdn.net/login',
  zhihu: 'https://www.zhihu.com/signin',
  baijiahao: 'https://baijiahao.baidu.com/',
  weibo: 'https://weibo.com/login.php',
  bilibili: 'https://passport.bilibili.com/login',
  douyin: 'https://creator.douyin.com/',
  x: 'https://x.com/i/flow/login',
  xiaohongshu: 'https://creator.xiaohongshu.com/login',
};

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  article?: ArticleMeta;
  children: TreeNode[];
}

function buildFileTree(articles: ArticleMeta[]): TreeNode[] {
  const root: TreeNode[] = [];
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
  return root.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

export default function App() {
  const [activeView, setActiveView] = useState<MainView>('editor');
  const [sideTab, setSideTab] = useState<SideTab>('files');
  const [settingCategory, setSettingCategory] = useState<SettingCategory>('image');
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'time'>('name');
  const [fileSearchOpen, setFileSearchOpen] = useState<boolean>(false);
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState<boolean>(false);
  const [sidebarMenuPinned, setSidebarMenuPinned] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(248);
  const [dragGhostX, setDragGhostX] = useState<number | null>(null);
  const [fileViewMode, setFileViewMode] = useState<'tree' | 'list'>('tree');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number;
    y: number;
    article: ArticleMeta;
  } | null>(null);
  const [contentSearchResults, setContentSearchResults] = useState<ArticleSearchResult[] | null>(null);
  const [activeArticle, setActiveArticle] = useState<ArticleMeta | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<string>('已同步');
  const [imageBed, setImageBed] = useState<ImageBedConfig>({
    strategy: 'platform_private',
    provider: 'picgo_core',
    defaultImageScale: 50,
  });
  const [imageBedTestMsg, setImageBedTestMsg] = useState<string>('');
  const [authStates, setAuthStates] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [gitStatus, setGitStatus] = useState<GitStatusInfo>({ isGitRepo: false, changedFiles: 0 });
  const [gitPushLog, setGitPushLog] = useState<string>('');
  const [publishModalOpen, setPublishModalOpen] = useState<boolean>(false);
  const [findBarOpen, setFindBarOpen] = useState<boolean>(false);
  const [findReplaceExpanded, setFindReplaceExpanded] = useState<boolean>(false);
  const [findQuery, setFindQuery] = useState<string>('');
  const [findMatchIndex, setFindMatchIndex] = useState<number>(0);
  const [findMatchTotal, setFindMatchTotal] = useState<number>(0);
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [replaceNotice, setReplaceNotice] = useState<string>('');
  const [theme, setTheme] = useState<ThemeId>('apple-light');
  const [customThemeName, setCustomThemeName] = useState<string>('');
  const editorRef = useRef<VditorEditorHandle>(null);
  const sidebarPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-img-scale',
      String(imageBed.defaultImageScale ?? 50)
    );
  }, [imageBed.defaultImageScale]);

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

  async function handleImportTyporaTheme() {
    const res = await window.electronAPI.importTyporaThemeCss();
    if (!res) return;
    // Scope Typora #write selector to Vditor .vditor-reset and preserve :root CSS variables
    const scopedCss = res.css
      .replace(/#write\b/g, '.vditor-ir pre.vditor-reset')
      .replace(/body\b/g, '.vcat-custom-theme-active');
    let styleEl = document.getElementById('vcat-custom-typora-theme') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'vcat-custom-typora-theme';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = scopedCss;
    setCustomThemeName(res.name);
    setTheme('custom-typora');
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  async function refreshWorkspace() {
    if (!window.electronAPI) return;
    const [wsPath, recent, list, imgCfg, auths, git] = await Promise.all([
      window.electronAPI.getWorkspacePath(),
      window.electronAPI.getRecentWorkspaces(),
      window.electronAPI.listArticles(),
      window.electronAPI.getImageBedConfig(),
      window.electronAPI.getPlatformAuthStates(),
      window.electronAPI.getGitStatus(),
    ]);
    setWorkspacePath(wsPath);
    setRecentWorkspaces(recent);
    setArticles(list);
    setImageBed(imgCfg);
    setAuthStates(auths);
    setGitStatus(git);
    if (!activeArticle && list.length > 0) {
      await openArticle(list[0]);
    }
  }

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  // Typora-identical macOS / Windows global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === 's') {
        e.preventDefault();
        const latest = editorRef.current?.getValue() ?? markdown;
        void handleSaveArticle(latest);
      } else if (key === 'f') {
        e.preventDefault();
        setActiveView('editor');
        setFindBarOpen((v) => !v);
      } else if (key === 'n') {
        e.preventDefault();
        void handleCreateBlankArticle();
      } else if (key === ',' && !e.shiftKey) {
        e.preventDefault();
        setActiveView((v) => (v === 'settings' ? 'editor' : 'settings'));
      } else if (key === '\\' || (e.shiftKey && key === 'l')) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle, markdown]);

  // Listen to native macOS Menu Bar actions
  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    return window.electronAPI.onMenuAction((action, payload) => {
      if (action === 'file:new') void handleCreateBlankArticle();
      else if (action === 'file:openWorkspace') void handleSelectWorkspace();
      else if (action === 'file:save') void handleSaveArticle(markdown);
      else if (action === 'publish:open') setPublishModalOpen(true);
      else if (action === 'view:settings') setActiveView((v) => (v === 'settings' ? 'editor' : 'settings'));
      else if (action === 'view:manager') setActiveView('manager');
      else if (action === 'view:editor') setActiveView('editor');
      else if (action === 'view:toggleSidebar') setSidebarOpen((v) => !v);
      else if (action === 'view:sideTab' && (payload === 'files' || payload === 'outline')) {
        setSidebarOpen(true);
        setSideTab(payload);
      } else if (action === 'theme:set' && payload) {
        setTheme(payload as ThemeId);
      } else if (action === 'editor:format' && payload) {
        setActiveView('editor');
        editorRef.current?.applyFormat(payload);
      } else if (action === 'editor:table' && payload) {
        setActiveView('editor');
        editorRef.current?.applyTableAction(payload);
      } else if (action === 'editor:find') {
        setActiveView('editor');
        setFindBarOpen(true);
      }
    });
  }, [activeArticle, markdown]);

  async function openArticle(meta: ArticleMeta) {
    const content = await window.electronAPI.readArticle(meta.relativePath);
    setActiveArticle(meta);
    setMarkdown(content);
    setSaveState('已保存');
  }

  async function handleSelectWorkspace() {
    const selected = await window.electronAPI.selectWorkspace();
    if (selected) {
      setWorkspacePath(selected);
      const [list, git] = await Promise.all([
        window.electronAPI.listArticles(),
        window.electronAPI.getGitStatus(),
      ]);
      setArticles(list);
      setGitStatus(git);
      if (list.length > 0) {
        await openArticle(list[0]);
      } else {
        setActiveArticle(null);
        setMarkdown('');
      }
    }
  }

  async function handleCreateBlankArticle() {
    const created = await window.electronAPI.createArticle();
    const list = await window.electronAPI.listArticles();
    setArticles(list);
    await openArticle(created);
    setActiveView('editor');
  }

  async function handleSwitchRecentWorkspace(dirPath: string) {
    setSidebarMenuOpen(false);
    const switched = await window.electronAPI.switchWorkspace(dirPath);
    if (switched) {
      setActiveArticle(null);
      await refreshWorkspace();
    }
  }

  async function handleSaveArticle(nextContent: string) {
    if (!activeArticle) return;
    setSaveState('保存中...');
    await window.electronAPI.saveArticle(activeArticle.relativePath, nextContent);
    setSaveState('已保存');
    const [list, git] = await Promise.all([
      window.electronAPI.listArticles(),
      window.electronAPI.getGitStatus(),
    ]);
    setArticles(list);
    setGitStatus(git);
  }

  async function handleChangeImageStrategy(strategy: ImageBedConfig['strategy']) {
    const next: ImageBedConfig = { ...imageBed, strategy };
    setImageBed(next);
    await window.electronAPI.saveImageBedConfig(next);
  }

  async function handlePlatformLogin(platformId: PlatformId) {
    const url = PLATFORM_LOGIN_URLS[platformId] ?? 'https://www.cnblogs.com';
    const ok = await window.electronAPI.openPlatformLogin(platformId, url);
    setAuthStates((prev) => ({ ...prev, [platformId]: ok }));
  }

  async function handleGitPush() {
    setGitPushLog('正在执行 git add / commit / push...');
    const title = activeArticle?.title || 'update';
    const res = await window.electronAPI.pushGitWorkspace(`post: ${title}`);
    setGitPushLog(res.message);
    const git = await window.electronAPI.getGitStatus();
    setGitStatus(git);
  }

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
    if (!fileContextMenu) return;
    const close = () => setFileContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [fileContextMenu]);

  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault();
    let latestWidth = sidebarWidth;
    setDragGhostX(Math.min(420, Math.max(200, e.clientX)));
    let delayTimer: ReturnType<typeof setTimeout> | null = null;

    const onMove = (moveEvent: MouseEvent) => {
      const clamped = Math.min(420, Math.max(200, moveEvent.clientX));
      latestWidth = clamped;
      setDragGhostX(clamped);
      if (delayTimer) clearTimeout(delayTimer);
      delayTimer = setTimeout(() => {
        setSidebarWidth(clamped);
      }, 90);
    };

    const onUp = () => {
      if (delayTimer) clearTimeout(delayTimer);
      setSidebarWidth(latestWidth);
      setDragGhostX(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleRenameStart(article: ArticleMeta) {
    setRenamingPath(article.relativePath);
    const baseName = article.relativePath.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    setRenameDraft(baseName);
  }

  async function handleRenameSubmit(oldRelativePath: string) {
    const nextName = renameDraft.trim();
    setRenamingPath(null);
    if (!nextName) return;
    try {
      const updated = await window.electronAPI.renameArticle(oldRelativePath, nextName);
      const list = await window.electronAPI.listArticles();
      setArticles(list);
      if (activeArticle?.relativePath === oldRelativePath) {
        setActiveArticle(updated);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '重命名失败');
    }
  }

  async function handleDeleteArticle(article: ArticleMeta) {
    const ok = window.confirm(`确定要将「${article.relativePath}」移到废纸篓吗？`);
    if (!ok) return;
    await window.electronAPI.deleteArticle(article.relativePath);
    const list = await window.electronAPI.listArticles();
    setArticles(list);
    if (activeArticle?.relativePath === article.relativePath) {
      if (list.length > 0) {
        await openArticle(list[0]);
      } else {
        setActiveArticle(null);
        setMarkdown('');
      }
    }
  }

  async function handleDuplicateArticle(article: ArticleMeta) {
    const duplicated = await window.electronAPI.duplicateArticle(article.relativePath);
    const list = await window.electronAPI.listArticles();
    setArticles(list);
    await openArticle(duplicated);
    setActiveView('editor');
  }

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

  const fileTree = useMemo(() => buildFileTree(filteredArticles), [filteredArticles]);
  const outlineNodes = useMemo(() => extractOutline(markdown), [markdown]);
  const liveWordCount = useMemo(() => countWords(markdown), [markdown]);
  const totalLocalImages = useMemo(
    () => articles.reduce((sum, item) => sum + item.localImageCount, 0),
    [articles]
  );
  const workspaceName = workspacePath ? workspacePath.split('/').pop() || workspacePath : '未挂载目录';

  function renderTreeNodes(nodes: TreeNode[], depth = 0) {
    return nodes.map((node) => {
      if (node.isDir) {
        const isOpen = expandedDirs[node.path] ?? true;
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => setExpandedDirs((prev) => ({ ...prev, [node.path]: !isOpen }))}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[12.5px] text-[#333333] hover:bg-[#eceef1]"
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-[#777777]" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-[#777777]" />
              )}
              <Folder className="h-3.5 w-3.5 shrink-0 text-[#777777]" />
              <span className="truncate">{node.name}</span>
            </button>
            {isOpen && renderTreeNodes(node.children, depth + 1)}
          </div>
        );
      }

      const article = node.article;
      const isSelected = activeArticle?.relativePath === article?.relativePath;
      const isRenaming = renamingPath === article?.relativePath;
      return (
        <div
          key={node.path}
          onContextMenu={(e) => {
            if (!article) return;
            e.preventDefault();
            e.stopPropagation();
            setFileContextMenu({ x: e.clientX, y: e.clientY, article });
          }}
        >
          {isRenaming && article ? (
            <div style={{ paddingLeft: `${22 + depth * 12}px` }} className="pr-2 py-[2px]">
              <input
                type="text"
                autoFocus
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
                className="w-full rounded border border-[var(--accent)] bg-white px-1.5 py-0.5 text-[12.5px] outline-none"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (article) {
                  void openArticle(article);
                  setActiveView('editor');
                }
              }}
              onDoubleClick={() => {
                if (article) handleRenameStart(article);
              }}
              style={{ paddingLeft: `${22 + depth * 12}px` }}
              className={`flex w-full items-center gap-1.5 rounded py-[3px] pr-2 text-left text-[12.5px] leading-5 ${
                isSelected
                  ? 'bg-[#e6eff8] font-medium text-[#2c5e91]'
                  : 'text-[#333333] hover:bg-[#eceef1]'
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
    <div className="relative flex h-screen w-screen overflow-hidden bg-white text-[#333333]">
      {/* 侧边栏拖拽时的延时虚影参考线 */}
      {dragGhostX !== null && (
        <div
          style={{ left: `${dragGhostX}px` }}
          className="pointer-events-none fixed top-0 bottom-0 z-50 w-[2px] border-r border-dashed border-[#007aff] bg-[#007aff]/35 shadow-[0_0_8px_rgba(0,122,255,0.45)]"
        />
      )}

      {/* Typora 原生通顶左侧栏（含 macOS 红绿灯区 + 文件/大纲 + 全文搜索 + 底部动作菜单 + 拖拽调宽） */}
      {sidebarOpen && (
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className="relative flex h-screen shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--side-bar-bg-color)] transition-[width] duration-75 ease-out select-none"
        >
          {/* 顶部 macOS 红绿灯留白拖动区 */}
          <div className="app-drag flex h-[38px] shrink-0 items-center justify-end px-3" />

          {/* Typora 式 文件 / 大纲 切换栏 + 搜索按钮 */}
          <div className="flex h-8 shrink-0 items-center border-b border-[var(--border-color)] px-3 text-[12px]">
            <button
              type="button"
              onClick={() => setSideTab('files')}
              className={`flex-1 py-1 text-center font-medium ${
                sideTab === 'files'
                  ? 'border-b-2 border-[var(--accent)] text-[var(--text-main)]'
                  : 'text-[var(--control-text-color)] hover:text-[var(--text-main)]'
              }`}
            >
              文件
            </button>
            <button
              type="button"
              onClick={() => setSideTab('outline')}
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
              title="搜索文件"
              onClick={() => {
                setSideTab('files');
                setFileSearchOpen((v) => !v);
              }}
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
                onChange={(e) => setFileSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setFileSearchQuery('');
                    setFileSearchOpen(false);
                  }
                }}
                className="w-full rounded border border-[var(--border-color)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {/* 目录树 / 全文搜索结果 / 大纲区 */}
          <div
            tabIndex={0}
            onKeyDown={(e) => {
              if (sideTab !== 'files' || renamingPath || filteredArticles.length === 0) return;
              const idx = filteredArticles.findIndex((a) => a.relativePath === activeArticle?.relativePath);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = filteredArticles[Math.min(filteredArticles.length - 1, idx + 1)] ?? filteredArticles[0];
                if (next) void openArticle(next);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = filteredArticles[Math.max(0, idx - 1)] ?? filteredArticles[0];
                if (prev) void openArticle(prev);
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
                  void handleDeleteArticle(activeArticle);
                }
              }
            }}
            className="flex-1 overflow-y-auto px-1.5 py-2 outline-none"
          >
            {sideTab === 'files' ? (
              fileSearchQuery.trim() && contentSearchResults ? (
                contentSearchResults.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-[#777777]">未找到匹配的文件或正文内容</div>
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
                            if (art) {
                              void openArticle(art);
                              setActiveView('editor');
                            }
                          }}
                          className={`block w-full rounded px-2.5 py-1.5 text-left ${
                            isSelected ? 'bg-[#e6eff8] text-[#2c5e91]' : 'hover:bg-[#eceef1]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[12.5px] font-medium">
                            <span className="truncate">{res.relativePath}</span>
                            {res.matchCount > 0 && (
                              <span className="shrink-0 rounded bg-black/5 px-1 text-[10px] text-[#666666]">
                                {res.matchCount}
                              </span>
                            )}
                          </div>
                          {res.snippet && (
                            <div className="mt-0.5 line-clamp-2 text-[11px] text-[#777777]">{res.snippet}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : articles.length === 0 ? (
                <div className="px-3 py-4 text-xs text-[#777777]">暂无 Markdown 文件</div>
              ) : fileViewMode === 'list' ? (
                filteredArticles.map((art) => {
                  const isSelected = activeArticle?.relativePath === art.relativePath;
                  return (
                    <button
                      key={art.relativePath}
                      type="button"
                      onClick={() => {
                        void openArticle(art);
                        setActiveView('editor');
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFileContextMenu({ x: e.clientX, y: e.clientY, article: art });
                      }}
                      className={`flex w-full items-center gap-1.5 rounded px-2.5 py-[4px] text-left text-[12.5px] leading-5 ${
                        isSelected ? 'bg-[#e6eff8] font-medium text-[#2c5e91]' : 'text-[#333333] hover:bg-[#eceef1]'
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
              <div className="px-3 py-4 text-xs text-[#777777]">暂无标题大纲</div>
            ) : (
              outlineNodes.map((node, idx) => (
                <button
                  type="button"
                  key={`${node.line}-${idx}`}
                  onClick={() => {
                    setActiveView('editor');
                    const headings = document.querySelectorAll('.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4');
                    const target = Array.from(headings).find(
                      (h) => h.textContent?.trim() === node.text
                    );
                    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{ paddingLeft: `${8 + (node.level - 1) * 12}px` }}
                  className="block w-full truncate rounded py-[3px] pr-2 text-left text-[12.5px] leading-5 text-[#333333] hover:bg-[#eceef1]"
                >
                  {node.text}
                </button>
              ))
            )}
          </div>

          {/* Typora 底部工作区动作条与弹出菜单（支持右下角图钉锁定，未锁定时点击空白处关闭） */}
          <div ref={sidebarPopoverRef} className="relative shrink-0">
          {sidebarMenuOpen && (
            <div className="absolute bottom-8 left-2 right-2 z-40 rounded-lg border border-[#e5e7eb] bg-white/95 py-1.5 text-[12px] shadow-xl backdrop-blur-xs">
              <div className="flex items-center justify-between px-3 pb-1 text-[11px] font-semibold text-[#777777]">
                <span>操作</span>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarMenuPinned(false);
                    setSidebarMenuOpen(false);
                  }}
                  className="rounded p-0.5 hover:bg-[#f3f4f6] hover:text-[#333333]"
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void handleCreateBlankArticle();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#f0f4f8]"
              >
                新建文件
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  setSideTab('files');
                  setFileSearchOpen(true);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#f0f4f8]"
              >
                搜索（文件名 / 正文）
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void window.electronAPI.showInFinder(activeArticle?.relativePath);
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#f0f4f8]"
              >
                在 Finder 中显示
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void handleSelectWorkspace();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#f0f4f8]"
              >
                打开文件夹...
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                  void refreshWorkspace();
                }}
                className="block w-full px-3.5 py-1 text-left hover:bg-[#f0f4f8]"
              >
                刷新
              </button>

              <div className="my-1 flex items-center justify-between border-t border-[#eeeeee] px-3 pt-1 text-[11px] text-[#777777]">
                <span>排序</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSortBy('name')}
                    className={`rounded px-1.5 py-0.5 ${sortBy === 'name' ? 'bg-[#e6eff8] text-[#007aff]' : 'hover:bg-[#f3f4f6]'}`}
                  >
                    A-Z
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('time')}
                    className={`rounded px-1.5 py-0.5 ${sortBy === 'time' ? 'bg-[#e6eff8] text-[#007aff]' : 'hover:bg-[#f3f4f6]'}`}
                  >
                    最近
                  </button>
                </div>
              </div>

              {recentWorkspaces.length > 0 && (
                <div className="border-t border-[#eeeeee] pt-1">
                  <div className="px-3 pb-0.5 text-[11px] font-semibold text-[#777777]">最近使用的目录</div>
                  {recentWorkspaces.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        if (!sidebarMenuPinned) setSidebarMenuOpen(false);
                        void handleSwitchRecentWorkspace(dir);
                      }}
                      className="flex w-full items-center justify-between px-3 py-1 text-left hover:bg-[#f0f4f8]"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Folder className="h-3 w-3 shrink-0 text-[#777777]" />
                        <span className="truncate">{dir.split('/').pop() || dir}</span>
                      </span>
                      {dir === workspacePath && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#007aff]" />}
                    </button>
                  ))}
                </div>
              )}

              {/* 面板右下角图钉锁定栏 */}
              <div className="mt-1 flex items-center justify-end border-t border-[#eeeeee] px-2.5 pt-1">
                <button
                  type="button"
                  title={sidebarMenuPinned ? '取消锁定面板' : '锁定面板（不自动关闭）'}
                  onClick={() => setSidebarMenuPinned((p) => !p)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                    sidebarMenuPinned
                      ? 'bg-[#e6eff8] font-medium text-[#007aff]'
                      : 'text-[#777777] hover:bg-[#f3f4f6] hover:text-[#333333]'
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
              onClick={() => void handleCreateBlankArticle()}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#eceef1] hover:text-[#333333]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="工作区操作与最近目录"
              onClick={() => setSidebarMenuOpen((v) => !v)}
              className="min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-center hover:bg-[#eceef1] hover:text-[#333333]"
            >
              {workspaceName}
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                title="更多目录操作"
                onClick={() => setSidebarMenuOpen((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#eceef1] hover:text-[#333333]"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="切换大纲视图"
                onClick={() => setSideTab((t) => (t === 'files' ? 'outline' : 'files'))}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#eceef1] hover:text-[#333333]"
              >
                <ListTree className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          </div>

          {/* 右边缘拖拽调宽热区 */}
          <div
            onMouseDown={startSidebarResize}
            title="拖拽调整侧边栏宽度"
            className="absolute top-0 right-0 z-30 h-full w-[5px] cursor-col-resize hover:bg-[#007aff]/20"
          />
        </aside>
      )}

      {/* 侧边栏文件右键上下文菜单 */}
      {fileContextMenu && (
        <div
          style={{ left: `${fileContextMenu.x}px`, top: `${fileContextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-48 rounded-lg border border-[#e5e7eb] bg-white/95 py-1 text-[12.5px] text-[#1d1d1f] shadow-xl backdrop-blur-md"
        >
          <button
            type="button"
            onClick={() => {
              void openArticle(fileContextMenu.article);
              setActiveView('editor');
              setFileContextMenu(null);
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            打开
          </button>
          <div className="my-1 border-t border-[#eeeeee]" />
          <button
            type="button"
            onClick={() => {
              setFileContextMenu(null);
              void handleCreateBlankArticle();
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            新建文件
          </button>
          <button
            type="button"
            onClick={() => {
              setFileContextMenu(null);
              setSideTab('files');
              setFileSearchOpen(true);
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            搜索
          </button>
          <div className="my-1 border-t border-[#eeeeee]" />
          <button
            type="button"
            onClick={() => {
              setFileViewMode('list');
              setFileContextMenu(null);
            }}
            className="flex w-full items-center justify-between px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            <span>文档列表</span>
            {fileViewMode === 'list' && <span>✓</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setFileViewMode('tree');
              setFileContextMenu(null);
            }}
            className="flex w-full items-center justify-between px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            <span>文档树</span>
            {fileViewMode === 'tree' && <span>✓</span>}
          </button>
          <div className="my-1 border-t border-[#eeeeee]" />
          <button
            type="button"
            onClick={() => {
              const target = fileContextMenu.article;
              setFileContextMenu(null);
              void handleDuplicateArticle(target);
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            创建副本
          </button>
          <button
            type="button"
            onClick={() => {
              const target = fileContextMenu.article;
              setFileContextMenu(null);
              handleRenameStart(target);
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            重命名...
          </button>
          <button
            type="button"
            onClick={() => {
              const target = fileContextMenu.article;
              setFileContextMenu(null);
              void handleDeleteArticle(target);
            }}
            className="block w-full px-3.5 py-1 text-left text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
          >
            删除...
          </button>
          <div className="my-1 border-t border-[#eeeeee]" />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(fileContextMenu.article.fullPath);
              setFileContextMenu(null);
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            复制文件路径
          </button>
          <button
            type="button"
            onClick={() => {
              const rel = fileContextMenu.article.relativePath;
              setFileContextMenu(null);
              void window.electronAPI.showInFinder(rel);
            }}
            className="block w-full px-3.5 py-1 text-left hover:bg-[#007aff] hover:text-white"
          >
            在 Finder 中显示
          </button>
        </div>
      )}

      {/* 右侧主区 */}
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {/* Typora 式 36px 极简统一顶栏（去掉生硬分割线，更贴近原版无界纸张感） */}
        <header
          className={`app-drag flex h-[36px] shrink-0 items-center justify-between bg-white pr-5 select-none ${
            activeView === 'editor' ? 'border-b border-transparent' : 'border-b border-[#eeeeee]'
          } ${sidebarOpen ? 'pl-3' : 'pl-20'}`}
        >
          <div className="app-no-drag flex items-center gap-2">
            <button
              type="button"
              title={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded p-1 text-[#777777] hover:bg-[#f3f4f6] hover:text-[#333333]"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            {activeView !== 'editor' && (
              <button
                type="button"
                onClick={() => setActiveView('editor')}
                className="rounded px-2 py-0.5 text-xs text-[#4183c4] hover:bg-[#f0f6fc]"
              >
                ← 返回写作台
              </button>
            )}
          </div>

          {/* 居中当前标题（仿 Typora 居中文件名） */}
          <div className="truncate text-[12.5px] font-medium text-[#555555]">
            {activeView === 'editor'
              ? activeArticle?.relativePath ?? 'VCat Publisher'
              : activeView === 'manager'
                ? '文章管理台'
                : '偏好设置'}
          </div>

          {/* 右侧极简指标与核心动作 */}
          <div className="app-no-drag flex shrink-0 items-center gap-1 text-xs text-[#6e6e73]">
            <span className="mr-2 text-[11.5px] tabular-nums text-[#8e8e93]">
              {liveWordCount} 词 · {saveState}
            </span>
            <button
              type="button"
              title="文章管理台"
              onClick={() => setActiveView((v) => (v === 'manager' ? 'editor' : 'manager'))}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
                activeView === 'manager'
                  ? 'bg-[#e6eff8] text-[#007aff]'
                  : 'text-[#6e6e73] hover:bg-[#f2f2f7] hover:text-[#1d1d1f]'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="偏好设置 (图床 / 平台 / GitHub)"
              onClick={() => setActiveView((v) => (v === 'settings' ? 'editor' : 'settings'))}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
                activeView === 'settings'
                  ? 'bg-[#e6eff8] text-[#007aff]'
                  : 'text-[#6e6e73] hover:bg-[#f2f2f7] hover:text-[#1d1d1f]'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPublishModalOpen(true)}
              className="ml-1.5 flex h-[26px] items-center gap-1 rounded-md bg-[#007aff] px-2.5 text-[12px] font-medium text-white shadow-2xs transition hover:bg-[#0066d6]"
            >
              <Send className="h-3 w-3" />
              分发
            </button>
          </div>
        </header>

        {/* 主视图切换 */}
        <main className="flex flex-1 overflow-hidden">
          {activeView === 'editor' && (
            <section className="relative flex-1 overflow-hidden bg-[var(--bg-main)]">
              {findBarOpen && (
                <div className="absolute top-2 right-6 z-40 flex flex-col gap-1.5 rounded-lg border border-[#e5e7eb] bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title={findReplaceExpanded ? '收起替换栏' : '展开替换栏'}
                      onClick={() => setFindReplaceExpanded((v) => !v)}
                      className="flex h-6 w-5 items-center justify-center rounded text-[#6e6e73] hover:bg-[#f2f2f7]"
                    >
                      {findReplaceExpanded ? '▾' : '▸'}
                    </button>
                    <input
                      type="text"
                      autoFocus
                      placeholder="查找正文..."
                      value={findQuery}
                      onChange={(e) => {
                        const q = e.target.value;
                        setFindQuery(q);
                        setReplaceNotice('');
                        const total = editorRef.current?.findMatches(q) ?? 0;
                        setFindMatchTotal(total);
                        setFindMatchIndex(0);
                        if (total > 0) editorRef.current?.jumpToMatch(q, 0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && findQuery) {
                          e.preventDefault();
                          const total = editorRef.current?.findMatches(findQuery) ?? 0;
                          if (total > 0) {
                            const nextIdx = e.shiftKey
                              ? (findMatchIndex - 1 + total) % total
                              : (findMatchIndex + 1) % total;
                            setFindMatchTotal(total);
                            setFindMatchIndex(nextIdx);
                            editorRef.current?.jumpToMatch(findQuery, nextIdx);
                          }
                        } else if (e.key === 'Escape') {
                          setFindBarOpen(false);
                        }
                      }}
                      className="w-44 rounded border border-[#e5e7eb] px-2 py-1 text-xs outline-none focus:border-[#007aff]"
                    />
                    <span className="min-w-[44px] text-center text-[11px] tabular-nums text-[#8e8e93]">
                      {findQuery ? `${findMatchTotal > 0 ? findMatchIndex + 1 : 0} / ${findMatchTotal}` : ''}
                    </span>
                    <button
                      type="button"
                      title="上一个 (Shift+Enter)"
                      onClick={() => {
                        if (!findQuery || findMatchTotal === 0) return;
                        const prevIdx = (findMatchIndex - 1 + findMatchTotal) % findMatchTotal;
                        setFindMatchIndex(prevIdx);
                        editorRef.current?.jumpToMatch(findQuery, prevIdx);
                      }}
                      className="rounded px-1.5 py-0.5 text-[#6e6e73] hover:bg-[#f2f2f7]"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="下一个 (Enter)"
                      onClick={() => {
                        if (!findQuery || findMatchTotal === 0) return;
                        const nextIdx = (findMatchIndex + 1) % findMatchTotal;
                        setFindMatchIndex(nextIdx);
                        editorRef.current?.jumpToMatch(findQuery, nextIdx);
                      }}
                      className="rounded px-1.5 py-0.5 text-[#6e6e73] hover:bg-[#f2f2f7]"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setFindBarOpen(false)}
                      className="px-1 text-[#777777] hover:text-[#333333]"
                    >
                      ✕
                    </button>
                  </div>

                  {findReplaceExpanded && (
                    <div className="flex items-center gap-1.5 pl-6">
                      <input
                        type="text"
                        placeholder="替换为..."
                        value={replaceQuery}
                        onChange={(e) => setReplaceQuery(e.target.value)}
                        className="w-44 rounded border border-[#e5e7eb] px-2 py-1 text-xs outline-none focus:border-[#007aff]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const count = editorRef.current?.replaceAllText(findQuery, replaceQuery) ?? 0;
                          setReplaceNotice(`已替换 ${count} 处`);
                          setFindMatchTotal(0);
                          setFindMatchIndex(0);
                        }}
                        className="rounded bg-[#007aff] px-2.5 py-1 text-white hover:bg-[#0062cc]"
                      >
                        全部替换
                      </button>
                      {replaceNotice && <span className="text-[11px] text-[#007aff]">{replaceNotice}</span>}
                    </div>
                  )}
                </div>
              )}
              {activeArticle ? (
                <VditorEditor
                  ref={editorRef}
                  articleKey={activeArticle.relativePath}
                  value={markdown}
                  onChange={(md) => {
                    setMarkdown(md);
                    setSaveState('未保存');
                  }}
                  onSave={(md) => void handleSaveArticle(md)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[#777777]">
                  <p>当前工作区暂无文章</p>
                  <button
                    type="button"
                    onClick={() => void handleCreateBlankArticle()}
                    className="rounded bg-[#4183c4] px-3 py-1.5 text-xs text-white"
                  >
                    + 新建空白文章
                  </button>
                </div>
              )}
            </section>
          )}

          {activeView === 'manager' && (
            <div className="flex-1 overflow-y-auto p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold">文章管理台</h1>
                  <p className="mt-1 text-xs text-[#777777]">
                    当前目录：<code>{workspacePath ?? '未挂载'}</code>
                    {gitStatus.isGitRepo && (
                      <span className="ml-2 rounded bg-[#dafbe1] px-2 py-0.5 text-[#116329]">
                        Git: {gitStatus.branch} ({gitStatus.changedFiles} 项待推送)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSelectWorkspace()}
                    className="flex items-center gap-1.5 rounded border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs hover:bg-[#f6f8fa]"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    切换目录
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateBlankArticle()}
                    className="flex items-center gap-1 rounded bg-[#4183c4] px-3 py-1.5 text-xs text-white hover:bg-[#3572b0]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建空白文章
                  </button>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-3">
                <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                  <div className="text-xs text-[#777777]">本地文章总数</div>
                  <div className="mt-1 text-xl font-semibold">{articles.length} 篇</div>
                </div>
                <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                  <div className="text-xs text-[#777777]">本地 assets 引用</div>
                  <div className="mt-1 text-xl font-semibold">{totalLocalImages} 张</div>
                </div>
                <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                  <div className="text-xs text-[#777777]">已注册平台适配器</div>
                  <div className="mt-1 text-xl font-semibold text-[#4183c4]">{PLATFORM_CATALOG.length} 个</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-[#e5e7eb]">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead className="border-b border-[#e5e7eb] bg-[#fafafa] text-[#777777]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">文章标题 & 路径</th>
                      <th className="px-4 py-2.5 font-semibold">字数</th>
                      <th className="px-4 py-2.5 font-semibold">本地配图</th>
                      <th className="px-4 py-2.5 font-semibold">最后修改</th>
                      <th className="px-4 py-2.5 font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eeeeee]">
                    {articles.map((art) => (
                      <tr key={art.relativePath} className="hover:bg-[#fafbfc]">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              void openArticle(art);
                              setActiveView('editor');
                            }}
                            className="font-semibold text-[#4183c4] hover:underline"
                          >
                            {art.title}
                          </button>
                          <div className="text-[11px] text-[#777777]">{art.relativePath}</div>
                        </td>
                        <td className="px-4 py-3">{art.wordCount}</td>
                        <td className="px-4 py-3">{art.localImageCount} 张</td>
                        <td className="px-4 py-3 text-xs text-[#777777]">
                          {new Date(art.updatedAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void openArticle(art);
                                setActiveView('editor');
                              }}
                              className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1 text-xs hover:bg-[#f6f8fa]"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void openArticle(art);
                                setPublishModalOpen(true);
                              }}
                              className="rounded bg-[#4183c4] px-2.5 py-1 text-xs text-white hover:bg-[#3572b0]"
                            >
                              分发
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === 'settings' && (
            <div className="flex min-w-0 flex-1 overflow-hidden">
              <aside className="w-44 shrink-0 overflow-y-auto border-r border-[#e5e7eb] bg-[#fafafa] px-3 py-4">
                <div className="mb-2 px-2 text-[11px] font-semibold tracking-wider text-[#777777] uppercase">
                  偏好设置
                </div>
                <button
                  type="button"
                  onClick={() => setSettingCategory('image')}
                  className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs ${
                    settingCategory === 'image'
                      ? 'bg-[#e6eff8] font-semibold text-[#007aff]'
                      : 'text-[#333333] hover:bg-[#eef1f4]'
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  图像与图床
                </button>
                <button
                  type="button"
                  onClick={() => setSettingCategory('theme')}
                  className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs ${
                    settingCategory === 'theme'
                      ? 'bg-[#e6eff8] font-semibold text-[#007aff]'
                      : 'text-[#333333] hover:bg-[#eef1f4]'
                  }`}
                >
                  <Palette className="h-3.5 w-3.5" />
                  外观主题
                </button>
                <button
                  type="button"
                  onClick={() => setSettingCategory('platforms')}
                  className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs ${
                    settingCategory === 'platforms'
                      ? 'bg-[#e6eff8] font-semibold text-[#4183c4]'
                      : 'text-[#333333] hover:bg-[#eef1f4]'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  平台授权托管
                </button>
                <button
                  type="button"
                  onClick={() => setSettingCategory('github')}
                  className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs ${
                    settingCategory === 'github'
                      ? 'bg-[#e6eff8] font-semibold text-[#4183c4]'
                      : 'text-[#333333] hover:bg-[#eef1f4]'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  GitHub 静态博客
                </button>
              </aside>

              <section className="min-w-0 flex-1 overflow-y-auto bg-white p-6 md:p-8">
                {settingCategory === 'image' && (
                  <div className="max-w-2xl space-y-5">
                    <div>
                      <h2 className="text-base font-semibold">插入图片时</h2>
                      <p className="mt-1 text-xs text-[#777777]">
                        本地写作始终保存至 <code>./assets/</code>，离线完全可用。
                      </p>
                    </div>

                    <div className="rounded border border-[#e5e7eb] bg-[#fafafa] p-4 text-[13px]">
                      <div className="mb-2 font-medium">默认图片显示比例</div>
                      <div className="flex flex-wrap gap-2">
                        {([50, 75, 100] as const).map((scale) => (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => {
                              const next: ImageBedConfig = { ...imageBed, defaultImageScale: scale };
                              setImageBed(next);
                              void window.electronAPI.saveImageBedConfig(next);
                            }}
                            className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                              (imageBed.defaultImageScale ?? 50) === scale
                                ? 'border-[#007aff] bg-[#e6eff8] text-[#007aff]'
                                : 'border-[#e5e7eb] bg-white text-[#333333] hover:bg-[#f3f4f6]'
                            }`}
                          >
                            {scale}%{scale === 50 ? '（默认推荐）' : scale === 100 ? '（原宽）' : ''}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1.5 text-[11px] text-[#777777]">
                        插入图片后默认按所选比例居中展示，单击任意图片可随时放大至原图浏览。
                      </div>
                    </div>

                    <div className="space-y-3 rounded border border-[#e5e7eb] bg-[#fafafa] p-4 text-[13px]">
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="radio"
                          className="mt-1"
                          checked={imageBed.strategy === 'platform_private'}
                          onChange={() => void handleChangeImageStrategy('platform_private')}
                        />
                        <div>
                          <div className="font-medium">分发时直传目标平台官方图床（推荐）</div>
                          <div className="text-xs text-[#777777]">
                            推送公众号/博客园/CSDN 时自动上传为官方素材，彻底免疫跨平台防盗链
                          </div>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="radio"
                          className="mt-1"
                          checked={imageBed.strategy === 'custom_oss'}
                          onChange={() => void handleChangeImageStrategy('custom_oss')}
                        />
                        <div>
                          <div className="font-medium">上传至通用云图床（PicGo-Core / 全平台对象存储）</div>
                          <div className="text-xs text-[#777777]">
                            支持 PicGo-Core、阿里云 OSS、腾讯云 COS、AWS S3 / R2、GitHub、七牛云、SM.MS、Imgur
                          </div>
                        </div>
                      </label>

                      {imageBed.strategy === 'custom_oss' && (
                        <div className="mt-3 space-y-3 border-t border-[#e5e7eb] pt-3 text-xs">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {(
                              [
                                ['picgo_core', 'PicGo-Core'],
                                ['aliyun_oss', '阿里云 OSS'],
                                ['tencent_cos', '腾讯云 COS'],
                                ['s3', 'AWS S3 / R2'],
                                ['github', 'GitHub'],
                                ['qiniu', '七牛云'],
                                ['smms', 'SM.MS'],
                                ['imgur', 'Imgur'],
                              ] as const
                            ).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setImageBed({ ...imageBed, provider: id })}
                                className={`rounded border px-2 py-1.5 text-center font-medium ${
                                  (imageBed.provider ?? 'picgo_core') === id
                                    ? 'border-[#007aff] bg-[#e6eff8] text-[#007aff]'
                                    : 'border-[#e5e7eb] bg-white hover:bg-[#f3f4f6]'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          {(imageBed.provider ?? 'picgo_core') === 'picgo_core' && (
                            <input
                              type="text"
                              placeholder="PicGo-Core 可执行路径（默认 picgo）"
                              value={imageBed.picgoPath ?? ''}
                              onChange={(e) => setImageBed({ ...imageBed, picgoPath: e.target.value })}
                              className="w-full rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                            />
                          )}

                          {imageBed.provider === 'github' && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                placeholder="GitHub 仓库 (如 user/images)"
                                value={imageBed.repo ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, repo: e.target.value })}
                                className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                              <input
                                type="text"
                                placeholder="分支 (默认 main)"
                                value={imageBed.branch ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, branch: e.target.value })}
                                className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                              <input
                                type="password"
                                placeholder="Personal Access Token"
                                value={imageBed.token ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, token: e.target.value })}
                                className="sm:col-span-2 rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                            </div>
                          )}

                          {(imageBed.provider === 'smms' || imageBed.provider === 'imgur') && (
                            <input
                              type="password"
                              placeholder="API Token / Client ID"
                              value={imageBed.token ?? ''}
                              onChange={(e) => setImageBed({ ...imageBed, token: e.target.value })}
                              className="w-full rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                            />
                          )}

                          {(imageBed.provider === 'aliyun_oss' ||
                            imageBed.provider === 'tencent_cos' ||
                            imageBed.provider === 's3' ||
                            imageBed.provider === 'qiniu') && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                placeholder="Bucket 名称"
                                value={imageBed.bucket ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, bucket: e.target.value })}
                                className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                              <input
                                type="text"
                                placeholder="Region / Endpoint"
                                value={imageBed.region ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, region: e.target.value })}
                                className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                              <input
                                type="text"
                                placeholder="AccessKey"
                                value={imageBed.accessKey ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, accessKey: e.target.value })}
                                className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                              <input
                                type="password"
                                placeholder="SecretKey"
                                value={imageBed.secretKey ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, secretKey: e.target.value })}
                                className="rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                              <input
                                type="text"
                                placeholder="自定义加速域名 (可选)"
                                value={imageBed.customDomain ?? ''}
                                onChange={(e) => setImageBed({ ...imageBed, customDomain: e.target.value })}
                                className="sm:col-span-2 rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 outline-none focus:border-[#007aff]"
                              />
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await window.electronAPI.saveImageBedConfig(imageBed);
                                setImageBedTestMsg('图床配置已保存');
                              }}
                              className="rounded bg-[#007aff] px-3 py-1 text-white hover:bg-[#0066d6]"
                            >
                              保存配置
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await window.electronAPI.saveImageBedConfig(imageBed);
                                const res = await window.electronAPI.testImageBedUpload(imageBed);
                                setImageBedTestMsg(res.message);
                              }}
                              className="rounded border border-[#e5e7eb] bg-white px-3 py-1 hover:border-[#007aff] hover:text-[#007aff]"
                            >
                              测试图床连通性
                            </button>
                            {imageBedTestMsg && (
                              <span className="text-[11px] text-[#007aff]">{imageBedTestMsg}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {settingCategory === 'theme' && (
                  <div className="max-w-3xl space-y-4">
                    <div>
                      <h2 className="text-base font-semibold">外观主题（默认 Apple Light · 完整收录 Bloom 24 套）</h2>
                      <p className="mt-1 text-xs text-[#777777]">
                        也可随时通过 macOS 顶部菜单栏「主题」快速切换；基础色彩方案参考开源社区 Bloom / GitHub 主题规范。
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
                      {(
                        [
                          { id: 'apple-light', name: 'Apple Light（默认）', desc: 'SF Pro · 系统蓝' },
                          { id: 'typora-white', name: 'Typora White', desc: '经典 GitHub 纯白' },
                          { id: 'bloom-lapis', name: 'Bloom Lapis', desc: '文档蓝 · 护眼浅蓝' },
                          { id: 'bloom-lapis-dark', name: 'Bloom Lapis Dark', desc: '文档蓝 · 深邃夜蓝' },
                          { id: 'bloom-wheat', name: 'Bloom Wheat', desc: '象牙纸张 · 暖白' },
                          { id: 'bloom-wheat-dark', name: 'Bloom Wheat Dark', desc: '象牙暖棕 · 暗色' },
                          { id: 'bloom-amber', name: 'Bloom Amber', desc: '琥珀暖光' },
                          { id: 'bloom-amber-dark', name: 'Bloom Amber Dark', desc: '琥珀暗夜' },
                          { id: 'bloom-cinnabar', name: 'Bloom Cinnabar', desc: '朱砂红韵' },
                          { id: 'bloom-cinnabar-dark', name: 'Bloom Cinnabar Dark', desc: '朱砂暗夜' },
                          { id: 'bloom-ink', name: 'Bloom Ink', desc: '水墨清灰' },
                          { id: 'bloom-ink-dark', name: 'Bloom Ink Dark', desc: '水墨玄黑' },
                          { id: 'bloom-mist', name: 'Bloom Mist', desc: '薄雾青蓝' },
                          { id: 'bloom-mist-dark', name: 'Bloom Mist Dark', desc: '薄雾暗夜' },
                          { id: 'bloom-petal', name: 'Bloom Petal', desc: '花瓣樱粉' },
                          { id: 'bloom-petal-dark', name: 'Bloom Petal Dark', desc: '花瓣暗夜' },
                          { id: 'bloom-ripple', name: 'Bloom Ripple', desc: '涟漪湖青' },
                          { id: 'bloom-ripple-dark', name: 'Bloom Ripple Dark', desc: '涟漪暗夜' },
                          { id: 'bloom-sage', name: 'Bloom Sage', desc: '鼠尾草绿' },
                          { id: 'bloom-sage-dark', name: 'Bloom Sage Dark', desc: '鼠尾暗夜' },
                          { id: 'bloom-spring', name: 'Bloom Spring', desc: '春芽嫩绿' },
                          { id: 'bloom-spring-dark', name: 'Bloom Spring Dark', desc: '春芽暗夜' },
                          { id: 'bloom-stone', name: 'Bloom Stone', desc: '岩石暖灰' },
                          { id: 'bloom-stone-dark', name: 'Bloom Stone Dark', desc: '岩石暗夜' },
                          { id: 'bloom-verdant', name: 'Bloom Verdant', desc: '苍翠深绿' },
                          { id: 'bloom-verdant-dark', name: 'Bloom Verdant Dark', desc: '苍翠暗夜' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTheme(t.id)}
                          className={`rounded-lg border p-3 text-left transition ${
                            theme === t.id
                              ? 'border-[#007aff] bg-[#f0f7ff]'
                              : 'border-[#e5e7eb] bg-[#fafafa] hover:bg-[#f3f4f6]'
                          }`}
                        >
                          <div className="font-semibold text-[#1d1d1f]">{t.name}</div>
                          <div className="mt-0.5 text-[11px] text-[#6e6e73]">{t.desc}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-[#eeeeee] pt-4">
                      <button
                        type="button"
                        onClick={() => void handleImportTyporaTheme()}
                        className="rounded border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium hover:border-[#007aff] hover:text-[#007aff]"
                      >
                        导入本地 Typora 主题 CSS 文件（如 bloom-lapis.css）...
                      </button>
                      {customThemeName && (
                        <span className="ml-3 text-xs text-[#007aff]">
                          当前已加载：{customThemeName}.css
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {settingCategory === 'platforms' && (
                  <div className="max-w-3xl">
                    <h2 className="text-base font-semibold">外部平台隔离沙箱托管</h2>
                    <p className="mt-1 mb-4 text-xs text-[#777777]">
                      每个平台运行在独立的 Electron <code>persist:platform_*</code> 沙箱内，Cookie 本地持久化不串号。
                    </p>
                    <div className="divide-y divide-[#eeeeee] rounded border border-[#e5e7eb]">
                      {PLATFORM_CATALOG.map((p) => {
                        const online = Boolean(authStates[p.id]);
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between px-4 py-3 hover:bg-[#fafafa]"
                          >
                            <div>
                              <div className="flex items-center gap-2 text-[13px] font-semibold">
                                <span>{p.name}</span>
                                {online ? (
                                  <span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-[11px] text-[#116329]">
                                    ● 已授权
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] text-[#57606a]">
                                    未登录
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#777777]">
                                默认模式：{p.defaultMode === 'draft' ? '推入草稿箱' : '直接发布'} · 参考：{p.referenceSource}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handlePlatformLogin(p.id)}
                              className="rounded border border-[#e5e7eb] bg-white px-3 py-1 text-xs hover:border-[#4183c4] hover:text-[#4183c4]"
                            >
                              {online ? '更新授权' : '打开登录窗授权'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {settingCategory === 'github' && (
                  <div className="max-w-2xl space-y-4">
                    <h2 className="text-base font-semibold">GitHub 静态博客直推（本地 Git 模式）</h2>
                    <p className="text-xs text-[#777777]">
                      像平时用 Typora 一样打开你的 Hexo / Hugo / VitePress 仓库，写完直接 Commit & Push 触发 GitHub Actions CI/CD。
                    </p>
                    <div className="rounded border border-[#e5e7eb] bg-[#fafafa] p-4 text-xs space-y-2">
                      <div>当前工作区：<code>{workspacePath ?? '未挂载'}</code></div>
                      <div>
                        Git 仓库状态：
                        {gitStatus.isGitRepo ? (
                          <span className="font-semibold text-[#116329]">
                            ✓ 已识别 Git 仓库（分支：{gitStatus.branch} · {gitStatus.changedFiles} 项待提交）
                          </span>
                        ) : (
                          <span className="text-[#777777]">当前目录不是 Git 仓库（可在左下角切换至静态博客仓库目录）</span>
                        )}
                      </div>
                      {gitStatus.isGitRepo && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => void handleGitPush()}
                            className="rounded bg-[#4183c4] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3572b0]"
                          >
                            一键 Commit & Push 触发 CI/CD
                          </button>
                        </div>
                      )}
                      {gitPushLog && <div className="pt-1 text-[#4183c4]">{gitPushLog}</div>}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      {/* 合并分发弹窗 */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="w-[480px] rounded-lg border border-[#e5e7eb] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[#fafafa] px-4 py-3 text-sm font-semibold">
              <span>合并分发（{activeArticle?.title ?? '未选择文章'}）</span>
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="text-xs text-[#777777] hover:text-[#333333]"
              >
                关闭
              </button>
            </div>
            <div className="space-y-3 p-4 text-[13px] text-[#555555]">
              {gitStatus.isGitRepo && (
                <div className="flex items-center justify-between rounded border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                  <div>
                    <div className="font-medium text-[#333333]">GitHub 静态博客 ({gitStatus.branch})</div>
                    <div className="text-[11px] text-[#777777]">{gitStatus.changedFiles} 项改动待推送</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGitPush()}
                    className="rounded bg-[#4183c4] px-2.5 py-1 text-xs text-white hover:bg-[#3572b0]"
                  >
                    Commit & Push
                  </button>
                </div>
              )}
              {gitPushLog && <div className="text-xs text-[#4183c4]">{gitPushLog}</div>}
              <p className="text-xs text-[#777777]">
                其他平台（微信公众号、Linux.do、博客园、掘金、小红书等）已注册 {PLATFORM_CATALOG.length} 个适配器，可在「偏好设置 → 平台授权托管」先完成沙箱登录。
              </p>
              <div className="flex justify-end gap-2 pt-2">
                {activeArticle && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveArticle(markdown);
                      setPublishModalOpen(false);
                    }}
                    className="rounded border border-[#e5e7eb] px-3 py-1.5 text-xs hover:bg-[#f6f8fa]"
                  >
                    保存本地文章
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
