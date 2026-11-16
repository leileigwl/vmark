# Session Handoff（会话交接记录）

- **日期**：2026-11-17
- **当前阶段**：**Phase 1.5 深度精修与工程化规范落地**

---

## 一、已完成的核心能力与修复基线

1. **编辑区核心交互（单层无闪烁 + 表格/图片/灯箱/代码着色）**
   - **普通代码块单层直编**：永久隐藏普通代码块（非 Mermaid / 非 Math）只读预览层 `pre.vditor-ir__preview`，常驻单一可编辑 `pre.vditor-ir__marker--pre`，首次点击直接落光标、零闪烁、不跳回首行；统一移除尾部 `::after` 占位并固定底部 `20px` 留白，点击前后高度完全一致。
   - **原生 `CSS.highlights` 实时语法着色**：在不插入任何 `<span>` 标签的前提下实现关键字、字符串、注释、函数名、数字、内置类型六类高亮，并接入 `HIGHLIGHTABLE_LANGS` 语言白名单——`txt` / `text` / `plain` / `log` 与未标注语言保持纯文本不着色。
   - **行内格式与表格防护**：`Cmd+B` / `Cmd+I` 等在选区内直接包裹/剥离、带表格单元格选区钳制；表格内粘贴图片生成内联 Lute IR 节点不断行，支持 `Backspace` / `Delete` 直接删图；支持 `Ctrl+Z` 撤销后自动重绘损坏的 Mermaid。
   - **高清画布灯箱（`MediaLightbox`）**：单击图片或 Mermaid 流程图直接弹出窗口自适应灯箱（74vw × 74vh），支持连续按 `Space` 开关灯箱不滚屏、`ESC` 关闭、灯箱内滚轮缩放、360° 顺时针递增平滑旋转回正；快速双击 Mermaid 切换原位代码编辑；移除正文内滚轮缩放拦截。
   - **暗黑模式深度适配**：修复暗黑模式下 Mermaid v11 `<foreignObject>` 连线标签因内联 `padding` 被挤出视口的问题；移除 Mermaid 内部多层嵌套悬停/选中边框，统一高亮唯一外层卡片；超链接采用柔和冰蓝 `#78aee8`。
   - **图片右键专属菜单**：右键正文图片仅展示「放大预览 (空格)」「显示比例（25% / 50% / 75% / 100%）」「删除图片」，移除多余文字格式菜单。

2. **侧边栏文件树与交互**
   - 支持空白处右键新建文件/文件夹、重命名、复制、移到废纸篓、在 Finder 中显示、文档列表/文档树切换、正文全文搜索、拖拽移动文件与文件夹。
   - 支持 `Shift` 区间连选与右键批量删除；右键菜单自动检测视口边界（靠近底边自动向上翻转，多选时切换精简批量菜单）防止遮挡。
   - 单选态严格随 `activeArticle.relativePath` 同步，新建空白文档或从管理台点「编辑」时绝不出现双高亮；切换文章时后台异步保存上一篇并立即读取目标文件，消除切换延迟。

3. **工程化规范与自定义 CSS 入口**
   - **包管理器统一**：全仓唯一使用 **`pnpm`**，严禁混用 `npm` / `yarn`。
   - **500–600 行单文件解耦红线**：已拆出 `src/renderer/src/editor/`（`codeHighlight.ts`、`tableActions.ts`、`inlineFormat.ts`）、`src/renderer/src/components/sidebar/SidebarContextMenus.tsx`、`src/renderer/src/styles/`（`themes.css`、`editor.css`、`mermaid.css`）。
   - **自定义 CSS 入口**：在「偏好设置 → 外观主题」提供导入自定义 `.css` 文件入口，支持覆盖 `--bg-main` / `--text-main` / `--accent` / `--side-bar-bg-color` 与 `.vditor-reset`。
   - **命名与规划备注**：图标继续沿用「V + 横线」；防盗链云端图床方案保留至 Phase 3 规划；软件新命名待用户从 `Veline / Vellum / Verge / Velo / Vmark` 中最终确认（避开与小V猫重名）。

---

## 二、本轮待完成改造项（立即执行）

1. **修复快速连续切换文章导致内容错乱（竞态条件）**：
   - 在 `App.tsx` 的 `openArticle` 中引入递增 `openRequestIdRef` 与 `loadSeq`，在 `setActiveArticle` 先行高亮后异步 `readArticle`，仅当请求 ID 未过期时才更新 `markdown` 与 `loadSeq`，并在 `VditorEditor` 中监听 `[articleKey, loadSeq]` 同步更新，彻底杜绝快速连点 A→B→C 时出现「标题是 B、正文是 A」的错乱。
2. **修复 Word (`.docx`) 导出渲染与链接格式**：
   - 升级 `main/exportDocx.ts`：将 `[文字](链接)` 解析为干净的蓝色可点击超链接文本（不暴露原始 `(url)`），过滤空 `>` 引用行与 `<details>`/`<summary>` 标签，对齐清晰简洁的 Word 排版风格。
3. **精简「导出」子菜单文案**：
   - 将 `导出` 子菜单精简为 `PDF`、`HTML`、`Word (.docx)`、`按默认格式导出 (Cmd+Shift+E)`。
4. **优化代码语言标签回车直入代码框**：
   - 在 `.vditor-ir__marker--info`（如输入 `lat` 选 `latex`）按 `Enter` 后自动将光标落入下方代码编辑区 `pre.vditor-ir__marker--pre > code`，可直接粘贴或输入公式。

---

## 三、后续规划（Phase 2 / Phase 3）

- 接入 `better-sqlite3` 持久化 `sync_records` 与 `image_cache`，落地云端防盗链存储方案及 30+ 平台适配器与 5 步送达检测。
