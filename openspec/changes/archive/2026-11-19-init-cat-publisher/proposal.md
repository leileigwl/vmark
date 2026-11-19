# Proposal: VCat Publisher Desktop (创作者桌面分发工作台)

## Why

内容创作者与技术博主在撰写长文博客后，面临着繁琐的多平台手动分发痛点：各平台（博客园、知乎、掘金、CSDN等）后台格式各异、外链图片防盗链严重导致大量裂图，且需要频繁切换账号登录。市面上的多账号矩阵工具要么偏向营销带货、要么缺乏沉浸式的类似 Typora 的写作体验，无法将「本地优先写作」、「模板与素材管理」、「图床智能转存」和「一键多平台草稿同步」无缝融为一体。

本项目旨在构建一个基于 Electron + React 的现代化桌面端平台，以本地优先（Local-First）为核心，提供 Typora 级写作体验，并在分发时自动处理图片防盗链转存与多平台草稿箱推送，首发聚焦博客园及主流技术社区，后续平滑演进支持小红书 3:4 卡片图文切片。

## What Changes

- **新建桌面端底座**：基于 Electron + Node.js 主进程架构，结合独立 Partition 沙箱管理各平台登录态（Cookie / Session）。
- **Typora 级即时渲染写作**：集成 Vditor (`ir` 即时渲染模式)，支持开箱即用的技术博客模板库与可复用素材库（Callout、代码卡片、引流签名档）。
- **本地优先（Local-First）资产管理**：文章以真实 `.md` 文件与本地 `assets/` 目录组织，配合本地 SQLite 记录发布历史、线上链接与同步状态。
- **智能图床与防盗链管线**：实现本地图片检测，支持分发时直接私密上传平台官方素材库（如博客园文件/微信素材）或用户自配的 OSS/COS/GitHub/S3 图床，自动完成外链替换。
- **多平台分发与导入适配器引擎**：实现博客园（Cnblogs）、掘金、知乎、CSDN、自建博客（WordPress/Typecho）等主流平台的发布适配与文章导入，后期拓展小红书卡片转换发布。

## Capabilities

### New Capabilities

- `editor/workspace-manager`: 本地目录挂载、Markdown 文件树与 SQLite 混合元数据状态管理。
- `editor/wysiwyg-editor`: 基于 Vditor 的类 Typora 即时渲染编辑器、预置模板库与自定义素材插槽体系。
- `assets/image-pipeline`: 本地图片资产管理、跨平台防盗链智能转存与多图床（OSS/COS/S3/平台素材库）上传驱动。
- `distribution/multi-platform-sync`: 基于独立 Session 沙箱的各平台会话管理、草稿箱批量分发与文章反向导入引擎。

### Modified Capabilities

(无，本项目为全新初始化项目)

## Impact

- **技术栈依赖**：新增 Electron, Vite, React 18, TypeScript, Tailwind CSS, Vditor, Better-SQLite3, PicGo-Core。
- **本地环境影响**：在用户本地机器上创建独立的应用程序数据目录，管理 Cookie 沙箱和 SQLite 数据库文件，不修改用户原始 Markdown 文件的纯文本格式。
