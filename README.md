<div align="center">

<img src="apps/desktop/build/icon.svg" alt="Vmark Logo" width="88" height="88" />

# Vmark（维记）

**简体中文** | [English](README_EN.md)

### 安静写好每一篇本地 Markdown 笔记，写完顺手分发到全平台

**`V`（Verified · 翼标）+ `Mark`（Markdown · 书签印记）：一款 100% Local-First（本地优先）的桌面端 Markdown 笔记与文档编辑器。打开任意本地文件夹即可专注记录，支持即时渲染、大纲检索、Mermaid 流程图、KaTeX 公式与 24 套 Bloom 主题；写完无需复制粘贴，内置防盗链图片转存与平台草稿箱合规分发。**

[![License: AGPL-3.0 / Commercial](https://img.shields.io/badge/License-AGPL--3.0%20%2F%20Commercial-1c1917.svg)](LICENSE)
[![Platform: macOS | Windows | Linux](https://img.shields.io/badge/OS-macOS%20%7C%20Windows%20%7C%20Linux-3b7cc4.svg)](https://github.com/leileigwl/vmark/releases/latest)
[![Local-First](https://img.shields.io/badge/Storage-100%25%20Local--First-2ea44f.svg)](#-为什么选择-vmark-做笔记)
[![TypeScript](https://img.shields.io/badge/TypeScript-Monorepo-3178C6.svg)](#-系统架构与-monorepo-目录)

[下载最新版](https://github.com/leileigwl/vmark/releases/latest) · [核心笔记体验](#-为什么选择-vmark-做笔记) · [多平台分发与卡片](#-写完之后一键分发到-10-平台) · [官网与部署](website/DEPLOY.md) · [常见问题](#-常见问题-faq)

<br />

| 浅色沉浸笔记写作台（Apple Light · 文件树 + 大纲 + Callout） | 暗黑护眼模式（Bloom Dark · 代码高亮 + Mermaid 流程图） |
| :---: | :---: |
| ![Vmark 浅色笔记写作界面](docs/assets/screenshots/1-editor-light.png) | ![Vmark 暗黑模式与流程图渲染](docs/assets/screenshots/2-editor-dark-mermaid.png) |

</div>

---

## ✨ 为什么选择 Vmark 做笔记？

Vmark 首先是一座**纯粹、离线可用、数据完全属于你的本地 Markdown 笔记与文档工作台**——即使你完全不发布文章，它依然是一款顺手的日常记录与技术写作工具：

- **📂 目录即工作区（100% Local-First）**：无需注册软件账号，没有专有数据库锁定。打开任意本地文件夹即可建库写作，所有文章保存为干净的标准 `.md` 纯文本；粘贴或拖入图片时，自动按哈希保存在同级 `./assets/` 目录并写入相对路径，断网 100% 完整读写，天然兼容 Git、iCloud Drive 或任意同步盘。
- **✍️ 即时渲染（IR），告别分屏割裂**：采用所写即所得的即时渲染编辑体验，输入 Markdown 语法即刻排版成形。左侧整合可折叠**文件树、实时文档大纲与全文搜索**，底部与顶栏实时呈现字词统计与自动保存状态。
- **📐 技术文档与知识梳理利器**：原生支持 **Mermaid 流程图 / 时序图**、**KaTeX 数学公式**、标准 GFM 表格、代码块语法高亮以及 `[!NOTE]` / `[!TIP]` 等 Callout 提示块。
- **🎨 24 套 Bloom 主题 + 自定义 CSS**：默认提供通透的 Apple Light 与沉稳暗黑共 24 套精心调校的护眼主题；支持在偏好设置中一键导入你自己的 CSS 样式文件。
- **🗂️ 本地文章管理台 & 平台草稿回流**：内置文章管理视图，一眼清点工作区内的笔记字数、本地配图与修改时间；还支持把散落在各平台后台的旧文章**反向拉取回本地**，自动转为 `.md` 并下载图片至 `./assets/`，导入后彻底切断云端绑定。

<div align="center">

![Vmark 本地文章管理台](docs/assets/screenshots/3-article-manager.png)

</div>

---

## 🚀 写完之后：一键分发到 10+ 平台

记完笔记、写好技术总结想公开发表时，Vmark 帮你跳过“手工传图 → 切多个后台 → 重调格式”的繁琐工序：

1. **平台原生级 AST 编译排版**：
   - **微信公众号**：由于微信编辑器禁用外部 `<style>`，Vmark 内置行内 Token 级代码着色、经典 Mac 顶栏样式，并将外链自动转为文末脚注。
   - **知乎专栏**：自动处理标题层级（H1 降级 H2）、生成标准 Prism 代码块与 `<figure>` 图片结构。
   - **稀土掘金 / CSDN / 百家号 / B 站专栏**：针对各平台规范剥离或适配 Frontmatter、处理请求签名与字数摘要。
2. **防盗链图片自动转存管线**：
   - 发布时在**内存层面**自动将本地 `./assets/` 图片与外部防盗链图片上传至平台素材库或自建图床（GitHub / SM.MS / PicGo），**绝不污染或篡改你本地的 `.md` 源文件**。
3. **本地沙箱隔离 & 默认只推草稿箱**：
   - 每个平台运行在本地独立的持久化分区，凭据由系统加密保护，零第三方中转服务器。主流平台**默认仅推入草稿箱**，由你在后台确认预览后再发布。
4. **3:4 高清视觉卡片引擎**：
   - 一键将结构化笔记自动分页渲染为 **1080×1440** 高对比封面卡片、正文排版卡与深色磨砂代码卡片，直接用于小红书、抖音与朋友圈分享。

<div align="center">

| 极简手记封面卡 (3:4) | Ink Classic 杂志封面 | 深色磨砂代码卡片 |
| :---: | :---: | :---: |
| <img src="docs/assets/screenshots/social_cards/xhs-card-01-cover.png" width="240" alt="小红书 3:4 封面卡片" /> | <img src="docs/assets/screenshots/social_cards/theme-ink-classic-cover.png" width="240" alt="Ink Classic 封面卡片" /> | <img src="docs/assets/screenshots/social_cards/douyin-card-03-code.png" width="240" alt="深色代码卡片" /> |

</div>

### 支持平台矩阵

| 分发模式 | 覆盖平台 | 核心机制 |
| :--- | :--- | :--- |
| **推入草稿箱（推荐）** | **微信公众号**、**知乎专栏**、**稀土掘金**、**CSDN**、**百家号**、**B 站专栏**、**小红书**、**抖音**、**微博** | 自动转存图片 + 平台定制渲染，安全推入账号草稿箱并校验直达链接 |
| **静态博客与直发** | **GitHub 静态博客**（Hexo / Hugo / VitePress / Astro）、**博客园** | 一键 Push 触发 CI/CD 或官方接口直发，发布后回查链接 |
| **3:4 视觉卡片导出** | **小红书**、**抖音**、**朋友圈长图** | 离线高保真光栅化为多套杂志 / 代码视觉卡片 |

---

## 📦 下载安装与本地开发

### 终端用户下载

前往 [GitHub Releases](https://github.com/leileigwl/vmark/releases/latest) 下载对应系统的安装包：

| 操作系统 | 安装包格式 | 说明 |
| :--- | :--- | :--- |
| **macOS** (Apple Silicon / Intel) | `.dmg` / `.zip` | 拖入 `Applications`；首次启动如遇未签名提示，请在「系统设置 → 隐私与安全性」点击仍要打开 |
| **Windows** (x64) | `.exe` | 双击安装即可使用，凭据通过系统 DPAPI (`safeStorage`) 本地加密保护 |
| **Linux** (Ubuntu / Debian) | `.AppImage` / `.deb` | 赋予执行权限直接运行，或使用 `dpkg -i` 安装 |

### 开发者本地运行

环境要求：**Node.js >= 20.0.0**、**pnpm >= 9.0.0**（全仓仅使用 `pnpm`）。

```bash
# 1. 克隆仓库并安装依赖
git clone https://github.com/leileigwl/vmark.git
cd vmark
pnpm install

# 2. 启动桌面端开发模式（Electron + Vite 热更新）
pnpm dev

# 3. 校验与构建
pnpm typecheck
pnpm test
pnpm build
```

> **官网展示页 (`website/`)**：仓库内同时包含基于 Vite + React + Tailwind CSS 构建的中英双语产品展示官网，支持部署至 Cloudflare Pages 并自动联动 `sitemap.xml` / `robots.txt` / `llms.txt`。详见 [website/DEPLOY.md](website/DEPLOY.md)。

---

## 🏗️ 系统架构与 Monorepo 目录

项目采用 `pnpm workspace + Turborepo` 分层解耦，详见 [产品定位文档](docs/PRODUCT.md) 与 [技术架构规范](docs/ARCHITECTURE.md)。

<details>
<summary>点击展开查看 Monorepo 目录与核心架构</summary>

```text
vmark/
├── apps/
│   └── desktop/                  # Electron + Vite + React 18 桌面端应用
│       ├── src/main/             # 主进程：文件系统、IPC 路由、隔离沙箱分区、心跳探活
│       ├── src/preload/          # Preload 安全桥接层
│       └── src/renderer/         # 渲染进程：Vditor IR 编辑器、Bloom 主题、文章管理、分发流
├── packages/
│   ├── shared/                   # 共享 TypeScript 契约与平台规范模型
│   ├── core/                     # 目录扫描、大纲解析、平台 AST 渲染与 3:4 卡片引擎
│   ├── image-pipeline/           # 本地 ./assets/ 管理、防盗链代理与弹性图床降级
│   └── adapters/                 # 多平台认证检测与草稿分发适配器
├── website/                      # 官方产品展示页（支持 SEO / GEO / Cloudflare Pages）
├── docs/                         # 产品规格、UI 规范与设计文档
└── openspec/                     # 规格驱动开发文档
```

</details>

---

## ❓ 常见问题 FAQ

- **Q：我不做自媒体，平时只用来写本地 Markdown 笔记和文档，适合用 Vmark 吗？**  
  A：非常适合。Vmark 的第一定位就是纯净的 Local-First 桌面 Markdown 笔记工作台，文件树、大纲、全文搜索、即时渲染、Mermaid、KaTeX 与 24 套 Bloom 主题均离线可用，完全无需绑定任何发布账号。
- **Q：为什么 Vmark 不做自己的云端账号和双向同步？**  
  A：为了彻底避免云端绑定和覆盖冲突。你的笔记就是普通 `.md` 文件与 `./assets/` 图片文件夹，可以自由配合 Git、iCloud Drive、OneDrive 或 Syncthing 完成备份与多设备同步。
- **Q：多平台分发时，我的 Cookie 和图床密钥会上传到服务器吗？**  
  A：不会。Vmark 是纯本地桌面端应用，没有第三方后端中转服务器；每个平台在本地独立沙箱分区运行，敏感凭据由系统级安全存储保护。

---

## 📄 开源与商业双授权协议

本项目采用 **GNU AGPL-3.0-only + 商业授权双协议**：

- **开源使用**：个人学习、科研及完整遵守 AGPL-3.0 条款的开源项目，可按 [LICENSE](LICENSE) 免费使用与分发。
- **商业使用**：闭源集成、私有商业发行版或闭源商用服务，须购买商业授权。详情请查阅 [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)。
