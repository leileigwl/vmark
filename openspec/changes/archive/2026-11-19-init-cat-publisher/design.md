# Design: VCat Publisher Desktop 架构与设计方案

## Context

见 `proposal.md`。本项目为全新桌面端自媒体/技术博客创作者工作台。系统需要提供原生桌面的高性能、低延迟写作体验，同时攻克各大内容平台防盗链、Cookie 隔离维护以及接口分发适配的痛点。

## Goals / Non-Goals

**Goals:**
- 构建基于 Electron + Vite + React 18 + TypeScript 的现代化跨平台（macOS / Windows）应用架构。
- 提供基于 Vditor IR 模式的 Typora 级即时渲染 Markdown 写作、模板库与自定义素材插槽。
- 实现 Local-First 资产模型：本地纯 Markdown 文件与 assets 目录挂载，结合 SQLite 维护同步记录索引。
- 实现防盗链智能转存管线：支持分发时直接私密上传平台官方素材库（如博客园文件/微信素材）或用户自配的 OSS/COS/GitHub/S3 图床。
- 构建可扩展的多平台发布适配器（Adapter Pattern），首发覆盖博客园（Cnblogs）、掘金、知乎、CSDN 与自建博客。

**Non-Goals:**
- 不做云端集中式存储中心（不要求用户必须注册三方云账号，完全本地优先）。
- 第一阶段不强制上线小红书 3:4 切片算法（小红书转制作为后续独立演进阶段实现，但底层预留适配器接口）。
- 不破解或反编译各平台风控黑盒，仅通过 Electron 内嵌 WebView 真实上下文与标准 Web 接口进行合规交互。

## Decisions

### 1. Monorepo 工程结构与进程通信模型（对标 AntiGravity / FlowCanvas）
- **选型**：基于 `pnpm workspace + Turborepo` 的 Monorepo 结构：`apps/desktop`（Electron 主进程、Preload、React 18 渲染进程），`packages/shared`、`packages/core`、`packages/image-pipeline`、`packages/adapters`。
- **理由**：
  - 主进程负责底层文件 I/O、SQLite 数据库读写、PicGo/云存储上传、网络请求拦截与会话持久化。
  - 渲染进程通过类型安全的 `window.electronAPI` 与主进程通信，确保页面与 Node 原生 API 彻底隔离，提升安全性。
  - 平台登录使用隐藏或模态 `BrowserView` / `WebContents`，利用 `session.fromPartition('persist:platform_<id>')` 彻底物理隔离每个平台的 Cookie 与缓存。

### 2. 编辑器选型：Vditor (`ir` 即时渲染模式)
- **选型**：`vditor`。
- **替代方案考虑**：
  - *MarkText*：代码库较重，与现代 React 18 / Tailwind 组件树结合成本高。
  - *Tiptap (ProseMirror)*：扩展自由度极高，但实现完整复杂的 Markdown/公式/脑图即时渲染需要自行维护海量扩展。
  - *Vditor*：思源笔记同款底层，开箱即用支持 Typora 同款 `ir` 模式，原生支持代码高亮、公式、Emoji、表格、大纲提取与剪贴板贴图事件，二次封装为 React 组件成本极低。

### 3. 数据持久化方案：本地文件挂载 + SQLite 混合模式
- **选型**：纯本地 `.md` 文件组织 + `better-sqlite3` 轻量索引。
- **结构设计**：
  - 用户工作区目录：包含各种 `.md` 文件和存放本地图片的 `assets/` 目录。
  - 应用数据目录（`userData`）：存储 SQLite 数据库（`app.db`），表结构包含：
    - `articles`: 记录文章相对路径、标题、字数、最后同步时间、Hash 校验码。
    - `platform_sync_records`: 记录文章在各平台的发布状态（草稿/已发布）、线上 URL、文章 ID、发布时间。
    - `templates`: 内置与用户自定义模板元数据。
    - `snippets`: 素材库代码块、Callout、引流签名档。
    - `platform_accounts`: 各平台账号昵称、登录态有效期、独立 Partition 标识。

### 4. 智能图床与发布转存管线（Image Pipeline）
- **设计**：发布流程采用链式过滤器（Pipeline Filter）：
  1. 正则解析 Markdown 中所有 `![]()` 与 `<img>` 标签。
  2. 识别路径类型：本地路径（`./assets/...`） vs 外部 URL。
  3. 目标平台防盗链策略判定：
     - 若平台支持并配置了官方素材直传（如博客园文件接口），直接调用主进程上传 API 获取平台安全直链。
     - 若配置了用户专属 OSS/COS/GitHub，优先批量推送至云端 CDN。
  4. 内存中克隆一份待分发内容，将图片地址替换为安全链接，原本地 `.md` 文件保留相对路径不做任何破坏。

### 5. 多平台发布适配器（Adapter Architecture）
- **设计**：采用插件化适配器接口 `PlatformAdapter`：
  ```typescript
  interface PlatformAdapter {
    id: string; // 'cnblogs' | 'juejin' | 'zhihu' | 'csdn' | 'wordpress'
    name: string;
    loginUrl: string;
    checkAuth(session: Electron.Session): Promise<boolean>;
    uploadImage(file: Buffer, filename: string, session: Electron.Session): Promise<string>;
    createDraft(post: BlogPost, session: Electron.Session): Promise<DraftResult>;
    importArticle?(url: string): Promise<MarkdownDoc>;
  }
  ```
  参考并抽离 Wechatsync 的成熟协议规范，针对博客园（支持 MetaWeblog API 与现代化后台接口）提供极低失败率的双通道保障。

## Risks / Trade-offs

- **[各平台 Web 接口变动风控风险]** → 缓解方案：分发只推送到平台“草稿箱”而非直接公开群发，留出人工确认环节；适配器逻辑集中在独立模块，支持热更新接口定义或本地微调。
- **[本地大图上传超时]** → 缓解方案：发布前预检查图片尺寸，内置 Sharp / Canvas 本地无损压缩，上传带并发控制（最多 3 张并发）与重试机制。
- **[跨平台 Cookie 保持与失效]** → 缓解方案：利用 Electron `persist:` 分区持久化，定期后台心跳请求检测登录存活，失效时给用户醒目的重新扫码提示。

## Migration Plan

1. **Phase 1（基础工程脚手架）**：初始化 Electron-Vite-React 项目骨架，集成 Tailwind CSS + shadcn/ui，搭建工作区目录挂载与 SQLite 索引。
2. **Phase 2（Typora 级编辑器与模板）**：封装 Vditor React 组件，打通本地图片粘贴至 `assets/`，注入基础博客模板与素材库抽屉。
3. **Phase 3（图床与转存引擎）**：集成 PicGo-Core 与平台私有上传驱动，实现发布时图片防盗链拦截与替换。
4. **Phase 4（博客园与多平台同步）**：实现独立 Session 登录窗，接入博客园、掘金、知乎适配器，打通草稿箱一键推送与文章反向导入。
