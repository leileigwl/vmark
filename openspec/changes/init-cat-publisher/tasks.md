# Tasks

## 1. 工程脚手架与主渲染进程打通

- [ ] 1.1 初始化 Electron-Vite-React-TypeScript 项目基础结构（package.json, electron-builder, tsconfig），运行构建并验证开发模式窗口正常弹出
- [ ] 1.2 集成 Tailwind CSS 与基础暗色/明亮双主题排版系统，验证渲染进程基本界面展示
- [ ] 1.3 搭建安全 IPC 通信桥（Main/Preload/Renderer），定义强类型 `window.electronAPI` 接口，运行单测与通道冒烟验证

## 2. 本地工作区与 SQLite 索引引擎

- [ ] 2.1 集成 better-sqlite3 初始化本地数据库（articles, sync_records, templates, snippets 表），验证本地 CRUD 单测通过
- [ ] 2.2 实现本地工作区挂载、扫描算法与 chokidar 文件变更监听，验证选取外部文件夹后目录树即时加载且外部修改能实时同步

## 3. Typora 级即时渲染编辑器与模板素材库

- [ ] 3.1 封装 Vditor React 组件，配置 `ir`（即时渲染）模式与代码高亮，验证键入 Markdown 语法光标离开后自动转为富文本排版
- [ ] 3.2 拦截编辑器剪贴板与拖放事件，自动将图片写入工作区本地 `assets/` 目录并插入相对路径，验证离线断网下图片渲染正常
- [ ] 3.3 实现内置技术博客模板加载器与自定义素材抽屉（Callout 提示框、引流签名档），验证点击素材卡片能精准注入光标位置

## 4. 智能图床防盗链转存与博客园草稿分发

- [ ] 4.1 实现文章图片引用扫描器与防盗链分析器，验证能准确识别本地 assets 路径与目标平台防盗链风险外链
- [ ] 4.2 接入通用图床上传驱动与平台私有素材上传通道，验证在不篡改本地原始 md 文件的前提下生成安全分发副本
- [ ] 4.3 实现基于 Electron 独立 Partition 会话的平台登录管理器，验证博客园（Cnblogs）扫码/账密登录与 Cookie 凭据加密持久化
- [ ] 4.4 编写博客园发布适配器，打通草稿箱一键推送接口，并在 UI 端展示分发状态与草稿箱直达链接
- [ ] 4.5 实现外部文章反向导入解析器，验证输入博客园文章 URL 能无损转录为本地 `.md` 文件与本地配图

## Workflow follow-up

- 实施完毕后运行 `openspec validate --strict` 验证所有规范与任务闭环。
- 完成一轮完整发文与导入冒烟测试，通过 `openspec archive init-cat-publisher` 将本次规划归档为主干标准。
