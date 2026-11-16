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

## 二、已完成与本轮改造记录

### Round 23（已完成）
- `commitCodeBlockLanguage` 统一提交代码块语言；`mousedown`/`click` 双拦截 `.vditor-hint button` 解决点击失效；`ArrowUp/Down` + `Enter`/`Tab` 键盘选词；删空语言标签清除 `recentLanguage` 且不回填旧语言、消除空代码块内嵌蓝底框；`selectionchange` 自动收起并同步 KaTeX / Mermaid 预览；`PAIR_MAP` 补齐右括号 Overtype Skip。

### Round 24（本轮立即执行，已通过 `/grill-me` 对齐设计决策）
1. **禁止代码块内行内加粗（图 1）与重构嵌套/连续 `Ctrl+B` 加粗剥离（图 3）**：
   - `inlineFormat.ts`：检测到选区位于 `pre, .vditor-ir__node[data-type="code-block"], .vditor-ir__marker--info` 时直接返回，绝不在代码块内注入 `**` 或 `<span data-type="strong">`；对于含局部已加粗子节点的混合选区，自动扩展起止边界至完整包裹节点，整体未全粗则剥离内部碎片 `**` 合并为唯一干净加粗，整体已全粗或二次连按则还原为纯净纯文本。
   - `VditorEditor.tsx`：拦截 `Cmd/Ctrl+B` / `Cmd/Ctrl+I` 的 `e.repeat` 并调用 `e.stopImmediatePropagation()`。
2. **LaTeX / Mermaid 单击零闪烁（图 2）**：
   - 单击 `pre.vditor-ir__preview`（LaTeX / Math / Mermaid）绝不展开源码（LaTeX 静默高亮卡片、Mermaid 打开灯箱）；仅**双击卡片**或**点击左上角语言徽章/三圆点**才展开源码编辑。
3. **`.vditor-hint` 防穿透遮挡与前缀优先排序（图 4）**：
   - `editor.css` 将 `.vditor-ir .vditor-hint` 修正为 `.vditor .vditor-hint, .vditor-hint` 并提高至 `z-index: 9999`，确保绝不被下方代码块的 `z-index: 5` 语言徽章穿透；`positionLanguageHint()` 对输入前缀（如 `c`）按「完全相等 → 前缀匹配 → 子串」重排。
4. **`echarts` / `mindmap` 紧凑高度自适应（图 5）**：
   - 覆盖 Vditor 默认 `height: 420px`，空编辑态保持单行自适应高度，已渲染出实例时采用紧凑 `260px`。
5. **侧边栏新建文件回车不触发二次重命名（图 6 & 图 7）**：
   - `Sidebar.tsx` 新建输入框 `onKeyDown` 调用 `e.stopPropagation()`，列表容器守卫增加 `|| creatingItem`，并使用防重入标记防止 `onBlur` 与 `Enter` 双重触发。
6. **超链接默认无下划线，仅 `:hover` 显示（图 8）** 与 **黑白符号升级为 Apple Color Emoji + 舒适间距（图 9）**：
   - 默认移除超链接下划线，悬停时显示 3px 偏移下划线；自动为缺 `\uFE0F` 的黑白符号（如 `⚠` `⏱` `⚙` `⚖` `✍` 等）补齐彩色变体符并拉开图标与正文字符间距。
7. **自动化校验强制规范**：
   - 此后所有 UI 与交互改动必须编写 Playwright JS 自动化脚本在真机 Electron 窗口中跑通断言，再提交 Git 稳态基线。

### Round 26（已完成，真机 Playwright + 打包全通过）
1. **侧边栏文件创建撤销 / 重做（按钮 + 快捷键）**：
   - `App.tsx` 与 `Sidebar.tsx` 新增 `fileUndoStack` / `fileRedoStack`，在侧边栏底部工具栏 `+` 按钮旁新增 `Undo2` / `Redo2` 按钮，并绑定 `Cmd/Ctrl+Z` 撤销新建文件（移入废纸篓并切回上一篇）与 `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` 恢复新建文件。
2. **输入法切换后代码块语言角标（`.vditor-ir__marker--info`）自动兜底恢复**：
   - `VditorEditor.tsx` 新增 `ensureCodeBlockInfoMarkers()`，在 `enhanceDom()` 与 `compositionend` 捕获/帧回调中同步 `data-CodeLang`，当语言角标因中英文输入法切换被清除或置空时自动从 `language-*` / `data-CodeLang` 恢复（不干扰用户主动删空角标）。
3. **跨段落快速连续 `Ctrl+B` / `Ctrl+I` 保留选区且不残留 `*`**：
   - `inlineFormat.ts` 在按段落拆分子选区后调用 `expandRangeToEnclosingWrappers(..., INLINE_IR_NODE)`，避免将 `<span data-type="strong">` / `<span data-type="em">` 从中间劈开，并保留非目标行内节点结构及精准匹配单星号 `(?<!\*)\*(?!\*)`，确保多段落连续叠加/剥离加粗与斜体时选区不塌缩、无残留 `*`。
4. **macOS 桌面端打包（`electron-builder`）**：
   - `apps/desktop/package.json` 新增 `electron-builder` 配置与 `package:mac` 脚本，生成 `.app` 与 `.dmg` 桌面安装包（`apps/desktop/release/` 已加入 `.gitignore`）。

---

## 三、后续规划（Phase 2 / Phase 3）

- 接入 `better-sqlite3` 持久化 `sync_records` 与 `image_cache`，落地云端防盗链存储方案及 30+ 平台适配器与 5 步送达检测。
