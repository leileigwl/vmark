# VCat Publisher Desktop — 编辑器精修、Bloom 24 套主题与全图床技术规划

## 一、已对齐产品决策（`/grill-me` 确认）
1. **默认主题与 Bloom 开源致谢**：默认保持 **Apple Light**；将全部 **24 套开源 Bloom 主题**（12 亮色 + 12 暗色）内置进 macOS 顶部菜单栏「主题」与偏好设置，采用宽版舒适阅读版心（非 A4 窄条），并在开源致谢中注明参考来源（Bloom / Vditor / Wechatsync / siyuan-plugin-publisher）。
2. **全图床 & 图片默认 50% 缩放**：接入 **PicGo-Core / 内置直传双通道**（支持阿里云 OSS、腾讯云 COS、AWS S3/R2、GitHub、七牛云、SM.MS、Imgur），本地写入保持 `./assets/`；插入图片默认渲染为 **50% 宽度**（可在偏好设置切换 `50% / 75% / 100%`，点击可 Lightbox 放大）。
3. **Mermaid 与查找替换交互**：
   - **Mermaid**：单击弹出 Lightbox 放大预览（不展开源码）；快速双击原位切换为「单框代码编辑器」（隐藏下方预览），失焦或按 `Esc`/点「完成」重新渲染为流程图。
   - **查找替换（`Cmd+F`）**：默认仅显示纯查找高亮 + 上一个/下一个跳转（`Enter` / `Shift+Enter`）+ `当前 / 总数` 计数；点击左侧展开箭头才显示「替换为 / 全部替换」。

---

## 二、核心模块改造清单

### 1. 弹出面板点击空白处自动关闭（图 2）
- 未点击「锁定面板」时，全局 `mousedown` 监听检测到点击在 `操作` 面板与底部触发按钮之外的任意区域，立即关闭面板；锁定后点击空白处保持常驻。

### 2. 加粗 / 斜体快捷键修复 & 编辑器右键菜单增强（图 3、4、5、6）
- **修复 `Cmd+B` / `Cmd+I` 残留星号问题**：在 Vditor IR 选区执行加粗/斜体切换时，自动探测选区前后紧邻的 `**` / `*` 标记，精确剥离或包裹，避免选中 `**Workflow**` 再按 `Cmd+B` 产生 `*斜体*` 或残留 `*`。
- **完整右键菜单**：
  - 基础：剪切 / 拷贝 / 粘贴
  - 「格式」子菜单：加粗（`Cmd+B`）、斜体（`Cmd+I`）、删除线、行内代码、超链接
  - 「插入段落」：上方插入段落 / 下方插入段落
  - 「表格」子菜单（光标在表格内时显示）：上方插入行、下方插入行、左侧插入列、右侧插入列、删除行、删除列、复制表格、删除表格

### 3. 撤销 / 重做（`Cmd+Z` / `Cmd+Shift+Z`）体感延迟优化
- 调优 Vditor `undo.delay`（设为 `250ms` 合并连续输入而非长阻塞），并避免每次输入都触发全量 React 重排或大纲全量 DOM 扫描（大纲/字数防抖 350ms），让 `Cmd+Z` / `Cmd+Shift+Z` 瞬时响应。

### 4. Bloom 24 套开源主题与宽版适配（图 1）
- 在主进程读取或打包生成 Bloom 24 套 CSS 变量映射（Amber / Cinnabar / Ink / Lapis / Mist / Petal / Ripple / Sage / Spring / Stone / Verdant / Wheat 各 Light/Dark），同步挂载至 macOS 顶部菜单「主题」与设置页卡片，并加开源致谢说明。

### 5. 全图床配置面板 & 图片默认 50% 缩放
- 在 `packages/shared` 与 `main/index.ts` 扩展 `ImageBedConfig`，支持配置 `defaultImageScale`（`50 | 75 | 100`，默认 `50`）、PicGo-Core CLI 路径或各图床凭证（阿里云 OSS / 腾讯云 COS / S3 & R2 / GitHub / 七牛云 / SM.MS / Imgur），提供测试上传与主进程 `image:uploadRemote` 通道。
- 编辑器内 `.vditor-reset img` 按全局 `data-img-scale="50|75|100"` 呈现（居中/圆角/点击放大）。

### 6. 全流程端到端验证
- 更新 `e2e_test.mjs`，逐项验证：长文加载、`Cmd+F` 纯查找与展开替换、`Cmd+B` 加粗/取消加粗、表格操作、Mermaid 单击放大与双击单框编辑、未锁定面板点击空白关闭、图片 50% 默认缩放与 Bloom 主题切换。
