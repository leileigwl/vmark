# ARCHITECTURE.md：Monorepo 系统架构与技术规范

## 1. 仓库形态：Monorepo 工程结构

采用 **pnpm workspace + Turborepo** 组织代码，确保核心引擎、平台适配器、图床管线与桌面端外壳解耦：

```text
vcat-publisher-desktop/
├── apps/
│   └── desktop/                  # Electron + Vite + React 18 桌面端主应用
│       ├── src/main/             # Electron 主进程（文件 I/O、SQLite、Session 沙箱、IPC）
│       ├── src/preload/          # ContextBridge 强类型安全桥接
│       └── src/renderer/         # React 18 + Tailwind + Vditor (Typora 白色 github.css)
├── packages/
│   ├── shared/                   # 全局 TypeScript 类型契约、错误码、合规检查清单
│   ├── core/                     # 本地工作区扫描、SQLite 索引层、多平台预览渲染引擎（无模板）
│   ├── image-pipeline/           # 本地图片扫描、Sharp 压缩、PicGo-Core 与防盗链转存管线
│   └── adapters/                 # 多平台分级分发适配器（参考 Wechatsync / 思源 Publisher / 小V猫）
├── docs/                         # 单一事实来源文档与设计图纸（含 prototypes 原型门控）
├── openspec/                     # Spec-Driven Development 规格与变更提案
├── pnpm-workspace.yaml
└── turbo.json
```

## 2. 全平台分级接入矩阵与草稿/直发模式

根据 `references/Wechatsync`、`references/siyuan-plugin-publisher` 与小V猫/蚁小二实际调研，各平台技术通道与推送模式严格区分：

| 平台 | 首选协议通道 | 默认推送模式 | 送达成功检测方式 (`VERIFY_DELIVERY`) |
| :--- | :--- | :--- | :--- |
| **微信公众号** | Partition 沙箱 Web API (`mp.weixin.qq.com`) | **草稿箱**（需内联 CSS + 封面图上传） | 校验返回 `appMsgId`，生成草稿编辑直达 URL |
| **百家号** | Partition 沙箱 Web API (`baijiahao.baidu.com`) | **草稿箱** | 校验返回 `article_id`，生成编辑器直达 URL |
| **微博 (头条文章)** | Partition 沙箱 Web API (`card.weibo.com`) | **草稿箱** | 校验 `draft/create` + `draft/save` 返回 `id` 与编辑 URL |
| **CSDN** | Partition 沙箱 Web API (`editor.csdn.net`) | **草稿箱 / 可选直发** | 校验返回 `data.id`，生成 `editor.csdn.net/md?articleId=` |
| **博客园 (Cnblogs)** | **MetaWeblog 官方协议**（极稳） | **草稿箱 / 可选直发** | 校验返回 `postid` 及博文直达链接 |
| **Linux.do (Discourse)** | Discourse REST / 沙箱 Session (`posts.json` / `drafts.json`) | **直接发布(选板块) / 存全局草稿** | 校验返回 `topic_id` / `post_number`，拼装论坛贴直达链接 |
| **知乎 / 掘金** | Partition 沙箱 Web API | **草稿箱** | 校验返回的草稿 `id` 与预览链接 |
| **小红书 (P1)** | **对标小V猫/蚁小二**：Playwright 独立 Profile + 独立网络 | **草稿箱 (人工确认)** | 校验后台创作者草稿列表出现对应笔记 |

## 3. 推送前预览与 5 步可观测分发管线

### 推送前多平台效果预览（Pre-Publish Preview）
在分发弹窗或预览抽屉中，基于 `packages/core` 内置的平台样式编译器实时预览：
- **微信公众号**：自动应用公众号兼容内联 CSS（Inline Style），检查图片比例与代码块折行。
- **Linux.do**：按 Discourse Flavored Markdown（支持折叠、引用、代码块）预览。
- **小红书（P1 预演）**：按 3:4 图文卡片/千字短文限制进行分屏预览。

### 5 步可观测分发管线（杜绝假成功与卡死）
1. `PRECHECK`（鉴权预检）：校验独立 Partition Cookie 或 MetaWeblog 账密，失效即弹窗重登。
2. `IMAGE_TRANSFER`（缓存查重与转存）：查 SQLite `image_cache`，命中直接复用；未命中按并发 3 传至目标平台素材库或自配图床。
3. `TRANSFORM`（格式编译与微调注入）：合并用户在分发小窗微调的标题/标签/板块分类，编译目标格式（如公众号内联 HTML）。
4. `PUSH`（草稿箱推送 / 直接发布）：按所选模式调用适配器提交。
5. `VERIFY_DELIVERY`（送达成功二次检测）：校验返回的 `postId` 与真实可访问链接，回写 SQLite `sync_records`，管理台表格展示具体状态与直达入口。

## 4. 安全与合规红线

1. **凭据加密**：各外部平台 Cookie、MetaWeblog 密钥与图床密钥必须通过 Electron `safeStorage` 加密落库，渲染进程与日志中**零明文回显**。
2. **本地源文件不可侵犯**：图片链接替换仅在分发内存副本中进行，绝不篡改用户工作区原始 `.md` 文件中的相对路径。
