import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  FolderOpen,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Settings,
  Table2,
} from 'lucide-react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import type { ArticleMeta, ImageBedConfig } from '@vcat/shared';
import { VditorEditor } from './components/VditorEditor';

type MainTab = 'manager' | 'editor' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('manager');
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleMeta | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [saveState, setSaveState] = useState<string>('已同步本地');
  const [imageBed, setImageBed] = useState<ImageBedConfig>({ strategy: 'platform_private' });
  const [publishModalOpen, setPublishModalOpen] = useState<boolean>(false);

  async function refreshWorkspace() {
    const [wsPath, list, imgCfg] = await Promise.all([
      window.electronAPI.getWorkspacePath(),
      window.electronAPI.listArticles(),
      window.electronAPI.getImageBedConfig(),
    ]);
    setWorkspacePath(wsPath);
    setArticles(list);
    setImageBed(imgCfg);
    if (!activeArticle && list.length > 0) {
      await openArticle(list[0]);
    }
  }

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  async function openArticle(meta: ArticleMeta) {
    const content = await window.electronAPI.readArticle(meta.relativePath);
    setActiveArticle(meta);
    setMarkdown(content);
    setSaveState('已加载');
  }

  async function handleSelectWorkspace() {
    const selected = await window.electronAPI.selectWorkspace();
    if (selected) {
      setWorkspacePath(selected);
      const list = await window.electronAPI.listArticles();
      setArticles(list);
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
    setActiveTab('editor');
  }

  async function handleSaveArticle(nextContent: string) {
    if (!activeArticle) return;
    setSaveState('保存中...');
    await window.electronAPI.saveArticle(activeArticle.relativePath, nextContent);
    setSaveState('已保存至本地');
    const list = await window.electronAPI.listArticles();
    setArticles(list);
  }

  async function handleChangeImageStrategy(strategy: ImageBedConfig['strategy']) {
    const next: ImageBedConfig = { ...imageBed, strategy };
    setImageBed(next);
    await window.electronAPI.saveImageBedConfig(next);
  }

  const totalLocalImages = useMemo(
    () => articles.reduce((sum, item) => sum + item.localImageCount, 0),
    [articles]
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-white text-[#333333]">
      {/* 顶部经典导航栏 */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-[#fafafa] px-4 pl-20 select-none">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-semibold text-[#333333]">VCat Publisher</span>
          <nav className="flex gap-1 rounded-md bg-[#eceef1] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('manager')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium ${
                activeTab === 'manager' ? 'bg-white text-[#333333] shadow-xs' : 'text-[#777777]'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              文章管理台
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium ${
                activeTab === 'editor' ? 'bg-white text-[#333333] shadow-xs' : 'text-[#777777]'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              写作台
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium ${
                activeTab === 'settings' ? 'bg-white text-[#333333] shadow-xs' : 'text-[#777777]'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              图床与平台设置
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'editor' && (
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="flex items-center gap-1 rounded border border-[#e5e7eb] bg-white px-2.5 py-1 text-xs hover:bg-[#f6f8fa]"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              )}
              {sidebarOpen ? '收起左栏' : '展开左栏'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCreateBlankArticle}
            className="flex items-center gap-1 rounded border border-[#e5e7eb] bg-white px-2.5 py-1 text-xs hover:bg-[#f6f8fa]"
          >
            <Plus className="h-3.5 w-3.5" />
            新建空白文章
          </button>
          <button
            type="button"
            onClick={() => setPublishModalOpen(true)}
            className="flex items-center gap-1 rounded bg-[#4183c4] px-3 py-1 text-xs font-medium text-white hover:bg-[#3572b0]"
          >
            <Send className="h-3.5 w-3.5" />
            合并分发
          </button>
        </div>
      </header>

      {/* 主体内容区 */}
      <main className="flex flex-1 overflow-hidden">
        {activeTab === 'manager' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">本地工作区文章管理</h1>
                <p className="mt-1 text-xs text-[#777777]">
                  工作区目录：<code className="rounded bg-[#f5f5f5] px-1.5 py-0.5">{workspacePath ?? '未选择'}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={handleSelectWorkspace}
                className="flex items-center gap-1.5 rounded border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs hover:bg-[#f6f8fa]"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                切换本地目录
              </button>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                <div className="text-xs text-[#777777]">本地文章总数</div>
                <div className="mt-1 text-xl font-semibold">{articles.length} 篇</div>
              </div>
              <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                <div className="text-xs text-[#777777]">本地 assets 引用图片</div>
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
                    <th className="px-4 py-2.5 font-semibold">文章标题 & 相对路径</th>
                    <th className="px-4 py-2.5 font-semibold">字数</th>
                    <th className="px-4 py-2.5 font-semibold">本地配图</th>
                    <th className="px-4 py-2.5 font-semibold">最后修改</th>
                    <th className="px-4 py-2.5 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eeeeee]">
                  {articles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[#777777]">
                        当前目录暂无 `.md` 文章，点击右上角「+ 新建空白文章」开始写作。
                      </td>
                    </tr>
                  ) : (
                    articles.map((art) => (
                      <tr key={art.relativePath} className="hover:bg-[#fafbfc]">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              void openArticle(art);
                              setActiveTab('editor');
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
                                setActiveTab('editor');
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <>
            {sidebarOpen && (
              <aside className="flex w-60 shrink-0 flex-col border-r border-[#e5e7eb] bg-[#fafafa]">
                <div className="border-b border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#777777]">
                  本地工作区文件
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {articles.map((art) => (
                    <button
                      key={art.relativePath}
                      type="button"
                      onClick={() => void openArticle(art)}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] ${
                        activeArticle?.relativePath === art.relativePath
                          ? 'bg-[#e6eff8] font-medium text-[#4183c4]'
                          : 'hover:bg-[#eef1f4]'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{art.relativePath}</span>
                    </button>
                  ))}
                </div>
              </aside>
            )}

            <section className="flex-1 overflow-hidden bg-white">
              {activeArticle ? (
                <VditorEditor
                  articleKey={activeArticle.relativePath}
                  value={markdown}
                  onChange={(md) => {
                    setMarkdown(md);
                    setSaveState('未保存（Cmd+Enter 保存）');
                  }}
                  onSave={(md) => void handleSaveArticle(md)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#777777]">
                  请选择左侧文章或新建一篇空白文章开始写作
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-8">
            <section className="mb-6 rounded-md border border-[#e5e7eb] p-5">
              <h2 className="mb-3 flex items-center gap-2 border-b border-[#eeeeee] pb-2 text-sm font-semibold">
                <ImageIcon className="h-4 w-4 text-[#4183c4]" />
                图片资产与防盗链转存策略
              </h2>
              <div className="space-y-2.5 text-[13px]">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={imageBed.strategy === 'platform_private'}
                    onChange={() => void handleChangeImageStrategy('platform_private')}
                  />
                  <span>
                    <strong>目标平台私有图床直传优先（推荐）</strong>：本地写作存 <code>assets/</code>，分发时直传公众号/博客园/CSDN 图床，天然免疫防盗链
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={imageBed.strategy === 'custom_oss'}
                    onChange={() => void handleChangeImageStrategy('custom_oss')}
                  />
                  <span>
                    <strong>通用云图床托管（PicGo-Core）</strong>：统一托管至自配 OSS / COS / S3 / GitHub CDN
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-md border border-[#e5e7eb] p-5">
              <h2 className="mb-3 border-b border-[#eeeeee] pb-2 text-sm font-semibold">
                全平台适配器目录（参考 Wechatsync / 思源 Publisher / 小V猫）
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {PLATFORM_CATALOG.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-2.5"
                  >
                    <div>
                      <div className="text-[13px] font-semibold">{p.name}</div>
                      <div className="text-[11px] text-[#777777]">
                        默认：{p.defaultMode === 'draft' ? '推入草稿箱' : '直接发布'} · 通道：{p.authChannel}
                      </div>
                    </div>
                    <span className="rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[11px] text-[#57606a]">
                      待授权
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* 合并分发弹窗占位（Phase 2 将接入各平台实时 5 步执行器） */}
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
            <div className="p-4 text-[13px] text-[#555555]">
              <p className="mb-3">
                已就绪 <strong>{PLATFORM_CATALOG.length}</strong> 个平台适配器定义。下一里程碑将在主进程接入独立 Partition 沙箱登录与 5 步送达检测管线。
              </p>
              <div className="flex justify-end gap-2">
                {activeArticle && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveArticle(markdown);
                      setPublishModalOpen(false);
                    }}
                    className="rounded bg-[#4183c4] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3572b0]"
                  >
                    先保存当前本地文章
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部极简状态栏 */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[#e5e7eb] bg-[#fafafa] px-3.5 text-[11px] text-[#777777]">
        <span>
          工作区：{workspacePath ?? '未挂载'} · 样式：Typora White (github.css)
        </span>
        <span>{saveState}</span>
      </footer>
    </div>
  );
}
