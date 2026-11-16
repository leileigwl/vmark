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
  Palette,
  PanelLeft,
  Plus,
  Send,
  Settings,
  Table2,
} from 'lucide-react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import { countWords, extractOutline } from '@vcat/core';
import type { ArticleMeta, GitStatusInfo, ImageBedConfig, PlatformId, ThemeId } from '@vcat/shared';
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
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleMeta | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<string>('已同步');
  const [imageBed, setImageBed] = useState<ImageBedConfig>({ strategy: 'platform_private' });
  const [authStates, setAuthStates] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [gitStatus, setGitStatus] = useState<GitStatusInfo>({ isGitRepo: false, changedFiles: 0 });
  const [gitPushLog, setGitPushLog] = useState<string>('');
  const [publishModalOpen, setPublishModalOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<ThemeId>('apple-light');
  const editorRef = useRef<VditorEditorHandle>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  async function refreshWorkspace() {
    if (!window.electronAPI) return;
    const [wsPath, list, imgCfg, auths, git] = await Promise.all([
      window.electronAPI.getWorkspacePath(),
      window.electronAPI.listArticles(),
      window.electronAPI.getImageBedConfig(),
      window.electronAPI.getPlatformAuthStates(),
      window.electronAPI.getGitStatus(),
    ]);
    setWorkspacePath(wsPath);
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
        void handleSaveArticle(markdown);
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
    const name = `untitled-${Date.now().toString().slice(-4)}.md`;
    const created = await window.electronAPI.createArticle(name);
    const list = await window.electronAPI.listArticles();
    setArticles(list);
    await openArticle(created);
    setActiveView('editor');
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

  const fileTree = useMemo(() => buildFileTree(articles), [articles]);
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

      const isSelected = activeArticle?.relativePath === node.article?.relativePath;
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => {
            if (node.article) {
              void openArticle(node.article);
              setActiveView('editor');
            }
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
      );
    });
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#333333]">
      {/* Typora 原生通顶左侧栏（含 macOS 红绿灯区 + 文件/大纲 + 底部动作条） */}
      {sidebarOpen && (
        <aside className="flex h-screen w-[248px] shrink-0 flex-col border-r border-[#e5e7eb] bg-[#fafafa] select-none">
          {/* 顶部 macOS 红绿灯留白拖动区 */}
          <div className="app-drag flex h-[38px] shrink-0 items-center justify-end px-3" />

          {/* Typora 式 文件 / 大纲 切换栏 */}
          <div className="flex h-8 shrink-0 items-center border-b border-[#e5e7eb] px-4 text-[12px]">
            <button
              type="button"
              onClick={() => setSideTab('files')}
              className={`flex-1 py-1 text-center font-medium ${
                sideTab === 'files'
                  ? 'border-b-2 border-[#4183c4] text-[#333333]'
                  : 'text-[#777777] hover:text-[#333333]'
              }`}
            >
              文件
            </button>
            <button
              type="button"
              onClick={() => setSideTab('outline')}
              className={`flex-1 py-1 text-center font-medium ${
                sideTab === 'outline'
                  ? 'border-b-2 border-[#4183c4] text-[#333333]'
                  : 'text-[#777777] hover:text-[#333333]'
              }`}
            >
              大纲
            </button>
          </div>

          {/* 目录树 / 大纲区 */}
          <div className="flex-1 overflow-y-auto px-1.5 py-2">
            {sideTab === 'files' ? (
              articles.length === 0 ? (
                <div className="px-3 py-4 text-xs text-[#777777]">暂无 Markdown 文件</div>
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

          {/* Typora 底部工作区动作条（+ 新建 / 切换文件夹 / 列表大纲） */}
          <div className="flex h-[30px] shrink-0 items-center justify-between border-t border-[#e5e7eb] px-2.5 text-[11.5px] text-[#777777]">
            <button
              type="button"
              title="新建空白文章"
              onClick={() => void handleCreateBlankArticle()}
              className="rounded p-1 hover:bg-[#eceef1] hover:text-[#333333]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="切换本地博客目录"
              onClick={() => void handleSelectWorkspace()}
              className="max-w-[145px] truncate rounded px-1.5 py-0.5 hover:bg-[#eceef1] hover:text-[#333333]"
            >
              {workspaceName}
            </button>
            <button
              type="button"
              title="切换大纲视图"
              onClick={() => setSideTab((t) => (t === 'files' ? 'outline' : 'files'))}
              className="rounded p-1 hover:bg-[#eceef1] hover:text-[#333333]"
            >
              <ListTree className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>
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
          <div className="app-no-drag flex items-center gap-1.5 text-xs text-[#777777]">
            <span className="mr-1.5 text-[11px] text-[#888888]">{liveWordCount} 词 · {saveState}</span>
            <button
              type="button"
              title="文章管理台"
              onClick={() => setActiveView((v) => (v === 'manager' ? 'editor' : 'manager'))}
              className={`rounded p-1 hover:bg-[#f3f4f6] ${
                activeView === 'manager' ? 'bg-[#e6eff8] text-[#4183c4]' : 'text-[#666666]'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="偏好设置 (图床 / 平台 / GitHub)"
              onClick={() => setActiveView((v) => (v === 'settings' ? 'editor' : 'settings'))}
              className={`rounded p-1 hover:bg-[#f3f4f6] ${
                activeView === 'settings' ? 'bg-[#e6eff8] text-[#4183c4]' : 'text-[#666666]'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPublishModalOpen(true)}
              className="ml-1 flex items-center gap-1 rounded bg-[#4183c4] px-2.5 py-0.5 text-[11.5px] font-medium text-white hover:bg-[#3572b0]"
            >
              <Send className="h-3 w-3" />
              分发
            </button>
          </div>
        </header>

        {/* 主视图切换 */}
        <main className="flex flex-1 overflow-hidden">
          {activeView === 'editor' && (
            <section className="flex-1 overflow-hidden bg-[var(--bg-main)]">
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
            <div className="flex flex-1 overflow-hidden">
              <aside className="w-48 shrink-0 border-r border-[#e5e7eb] bg-[#fafafa] p-3">
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

              <section className="flex-1 overflow-y-auto bg-white p-8">
                {settingCategory === 'image' && (
                  <div className="max-w-2xl space-y-4">
                    <h2 className="text-base font-semibold">插入图片时</h2>
                    <p className="text-xs text-[#777777]">
                      本地写作始终保存至 <code>./assets/</code>，离线完全可用。
                    </p>
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
                          <div className="font-medium">上传至通用云图床（PicGo-Core / OSS / COS / S3）</div>
                          <div className="text-xs text-[#777777]">
                            适用于 GitHub 静态博客、Hexo / VitePress 等自建站
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {settingCategory === 'theme' && (
                  <div className="max-w-2xl space-y-4">
                    <h2 className="text-base font-semibold">外观主题（默认苹果风格）</h2>
                    <p className="text-xs text-[#777777]">
                      也可随时通过 macOS 顶部菜单栏「主题」快速切换。
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-[13px]">
                      {(
                        [
                          { id: 'apple-light', name: 'Apple Light（默认苹果白）', desc: 'SF Pro 字体 · #f5f5f7 侧栏 · #007aff 系统蓝' },
                          { id: 'bloom-lapis', name: 'Bloom Lapis（文档蓝）', desc: '清新冷调浅蓝底色 · 护眼氛围' },
                          { id: 'bloom-wheat', name: 'Bloom Wheat（象牙白）', desc: '温润象牙纸张底色 · 久写不累' },
                          { id: 'typora-white', name: 'Typora White（原版 GitHub）', desc: '经典 GitHub 纯白样式' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTheme(t.id)}
                          className={`rounded-lg border p-3.5 text-left transition ${
                            theme === t.id
                              ? 'border-[#007aff] bg-[#f0f7ff]'
                              : 'border-[#e5e7eb] bg-[#fafafa] hover:bg-[#f3f4f6]'
                          }`}
                        >
                          <div className="font-semibold text-[#1d1d1f]">{t.name}</div>
                          <div className="mt-1 text-xs text-[#6e6e73]">{t.desc}</div>
                        </button>
                      ))}
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
