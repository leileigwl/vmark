# ARCHITECTURE.md：Monorepo 系统架构与技术规范

## 1. 仓库形态：Monorepo 工程结构

采用 **pnpm workspace + Turborepo** 组织代码，确保核心引擎、平台适配器、图床管线与桌面端外壳解耦，便于独立单测与未来扩展：

```text
vcat-publisher-desktop/
├── apps/
│   └── desktop/                  # Electron + Vite + React 18 桌面端主应用
│       ├── src/main/             # Electron 主进程（文件 I/O、SQLite、Session 沙箱、IPC）
│       ├── src/preload/          # ContextBridge 强类型安全桥接
│       └── src/renderer/         # React 18 + Tailwind + shadcn/ui + Vditor 渲染进程
├── packages/
│   ├── shared/                   # 全局 TypeScript 类型契约、错误码、合规检查清单常量
│   ├── core/                     # 本地工作区扫描、SQLite 索引层、模板与格式转换核心
│   ├── image-pipeline/           # 本地图片扫描、Sharp 压缩、PicGo-Core 与防盗链转存管线
│   └── adapters/                 # 多平台分级分发适配器（参考 Wechatsync / 思源 Publisher）
├── docs/                         # 单一事实来源文档与设计图纸（含 prototypes 原型门控）
├── openspec/                     # Spec-Driven Development 规格与变更提案
├── pnpm-workspace.yaml
└── turbo.json
```

## 2. 核心技术栈选型

- **桌面端底座**：Electron（对标 AntiGravity / VS Code 架构），利用 `session.fromPartition('persist:platform_<id>')` 实现各平台 Cookie 物理隔离。
- **前端界面与编辑器**：React 18 + TypeScript + Tailwind CSS + shadcn/ui + **Vditor (`ir` 即时渲染模式)**。
- **本地存储**：真实 `.md` 文件 + `assets/` 目录，配合 `better-sqlite3`（仅记录同步状态、线上草稿 URL、模板/素材库与加密凭据索引）。
- **图床与图像处理**：`picgo-core` + `sharp` + 平台私有上传驱动。
- **高危平台自动化（P1 小红书）**：Playwright 真实浏览器独立 Profile + 独立网络配置（严格对标小V猫/蚁小二规范）。

## 3. 平台分级双通道 Driver 与 4 步可观测管线

为彻底解决社区吐槽最多的**“接口失效”**与**“卡死无反馈”**痛点：

### 分级接入策略
| 风险等级 | 代表平台 | 首选接入通道 | 降级/兜底策略 |
| :--- | :--- | :--- | :--- |
| **低风险（官方协议）** | 博客园 (Cnblogs)、WordPress | **官方协议通道**（MetaWeblog API / XML-RPC），极稳 | Cookie 沙箱 Web API |
| **中低风险（Web API）** | 掘金、知乎、CSDN | **Electron Partition 沙箱 Web API** | 独立适配器热更新配置文件 |
| **高风控（P1 演进）** | 小红书 | **对标小V猫/蚁小二**：Playwright 真实浏览器独立 Profile + 独立网络 | 人工确认进草稿，不做纯 Cookie 注入 |

### 4 步可观测同步管线（杜绝“正在同步”死等）
每次分发在主进程中严格执行可中断、带超时与进度回报的 4 步流水线：
1. `PRECHECK`（鉴权预检）：10s 超时校验目标平台会话有效性；失效直接报错并弹窗唤起对应 Partition 登录窗。
2. `IMAGE_TRANSFER`（逐图防盗链转存）：并发上限 3，单图 15s 超时 + 1 次重试，实时推送 `已完成 X/Y 张`。
3. `CONTENT_TRANSFORM`（差异化与格式转换）：应用“AI 一鱼多做”差异化标题/导语/标签，将 Markdown 编译为目标平台格式（HTML / ProseMirror JSON）。
4. `DRAFT_PUSH`（草稿箱提交）：推送草稿并返回草稿箱直达链接，更新本地 SQLite 同步记录。

## 4. 安全与合规红线

1. **凭据加密**：各外部平台 Cookie 与图床密钥必须通过 Electron `safeStorage` 加密落库，渲染进程与日志中**零明文回显**。
2. **本地源文件不可侵犯**：图片链接替换仅在分发内存副本中进行，绝不篡改用户工作区原始 `.md` 文件中的相对路径。
