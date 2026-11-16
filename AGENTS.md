# AGENTS.md：工作规则入口

本文件是 AI 编程助手与开发者在本仓库（**VCat Publisher Desktop**）内工作的总入口，负责说明先读什么、需求或技术变更写到哪里、何时必须暂停问用户，以及每轮结束时如何交接。  
产品边界以 [`docs/PRODUCT.md`](docs/PRODUCT.md) 为准，技术与安全约束以 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 为准，规格契约以 [`openspec/`](openspec/config.yaml) 为准。

## 每轮开始前（必须先读）

1. 先阅读 [`docs/session-handoff.md`](docs/session-handoff.md)，掌握当前所处阶段、已完成事项、真实测试状态和下一步待办。
2. 再阅读 [`docs/PRODUCT.md`](docs/PRODUCT.md) 与 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)；涉及流程图、框架图与视觉规范时，阅读 [`docs/02-design/diagrams-and-style-guide.md`](docs/02-design/diagrams-and-style-guide.md)。
3. 以用户本轮的最新指令为最高优先级；若与旧交接记录或旧文档冲突，先同步更新对应事实来源文档，再改代码。

## 需求和设计变更规范（先文档，后代码）

- **产品范围、用户角色、合规边界变化**：同步更新 [`docs/PRODUCT.md`](docs/PRODUCT.md) 与 `openspec/` 对应规格。
- **Monorepo 结构、技术栈、数据模型、安全边界变化**：同步更新 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 与 `openspec/` 对应 `design.md`。
- **视觉与前端开发强制四步门控（严格执行，不得跳步）**：
  1. **Step 1：样式图、流程与框架图** —— 先在 [`docs/02-design/diagrams-and-style-guide.md`](docs/02-design/diagrams-and-style-guide.md) 明确系统框架图、业务流程图与视觉色板/布局规范。
  2. **Step 2：草图设计（Figma / 交互原型）** —— 基于流程与样式规范绘制 Figma 草图或可交互 HTML 原型并提交用户确认。
  3. **Step 3：标准视觉稿** —— 草图确认后，输出最终标准视觉设计图。
  4. **Step 4：前端开发** —— 视觉稿确认通过后，方可编写或修改 `apps/desktop/` 前端页面代码。
- **过时文档处理**：淘汰或被替代的设计文档归档至 `docs/99-archive/`，不要在多个文档里重复抄录同一份完整规范。

## 开发阶段规范与安全红线

- **外部文档核对**：涉及第三方 SDK 或库（Electron、Vditor、PicGo-Core、better-sqlite3、Playwright）时，优先查官方最新文档（结合 `context7`），严禁凭记忆臆测 API 字段，严禁外泄任何密钥或 Cookie。
- **合规分发与风控底线**：
  1. 默认所有分发操作**仅推送到各平台草稿箱**，保留人工确认，绝不默认一键公开群发。
  2. 强制引导“一鱼多做”内容差异化（标题、导语、标签、封面按平台适配）与错峰节奏。
  3. 小红书等高风控平台严禁凭空臆测绕过方案，必须严格对标小V猫、蚁小二成熟配置（独立 Profile 环境 + 独立网络配置 + 合规节奏）。
- **密钥与凭据安全**：BYOK 大模型 Key 与平台 Cookie 必须在 Electron 主进程加密落库（如 `safeStorage`），渲染进程零回显。

## 何时必须停下来问用户

- 涉及改变产品核心功能范围、增删平台支持列表或变更差异化策略时。
- 涉及更换 Monorepo 包管理器、核心编辑器内核（Vditor）、本地数据库（SQLite）选型时。
- 涉及调整账号沙箱隔离策略、图床默认上传策略或高危平台自动化方案时。

## 每轮结束时（必须交接）

1. 更新 [`docs/session-handoff.md`](docs/session-handoff.md)：写明日期、当前阶段、本轮做了什么、实际执行的命令与测试通过情况（**未实际启动客户端或未执行真实平台联调的，必须明确标记为“未实机验证”**）、未决事项与下一步计划。
2. 不得把仅通过 Mock 测试的单元测试说成已完成真实平台（博客园/掘金/知乎/小红书）的线上端到端发布验证。

---

## Round 27 构思与技术方案（先文档对齐，待用户确认后再改代码）

1. **LaTeX / Mermaid 双击进入源码编辑仍闪刷一次的根因与方案**
   - **根因**：`VditorEditor.tsx` 仅在 `mousedown (e.detail >= 2)` 拦截并添加了 `.vditor-ir__node--expand`，但未拦截原生的 `dblclick` 事件，且 `focus()` / `sel.addRange()` 会触发 `selectionchange` 回调再次调用 `renderLatexBlocks()` / `rerenderBrokenMermaid()`，在预览层与源码层切换瞬间造成二次重绘闪跳。
   - **方案**：
     1. 在 `el` 上增加 `dblclick` 捕获阶段拦截（`preventDefault + stopPropagation + stopImmediatePropagation`），彻底阻断 Vditor 原生双击重解析。
     2. 在 `renderLatexBlocks()` 与 `rerenderBrokenMermaid()` 中跳过已包含 `.vditor-ir__node--expand` 的展开态节点，避免展开编辑时触发预览 DOM 重写。
     3. 双击切入展开态时同步隐藏 `previewPre` 并用 `requestAnimationFrame` 稳定焦点与选区。

2. **块间缝隙点击插入空行后、未输入内容即移走光标的自动回收方案**
   - **根因**：点击块间缝隙会插入 `<p data-block="0">\u200b</p>`，当用户未输入任何字符就点击其他区域时，该临时空行会永久残留在文档中。
   - **方案**：
     1. 为缝隙点击新建的临时空段落打上 `data-vcat-temp-gap="1"` 标记。
     2. 用户在该段落内实际输入非空文本后（`input` 事件检测），立即移除该临时标记使其转为正式段落。
     3. 在 `selectionchange` / `blur` 时扫描所有 `p[data-vcat-temp-gap="1"]`，若当前光标已离开该段落且内容仍为空（去除 `\u200b` 与空白后为空），则自动移除该空 `<p>`，恢复紧凑排版。

3. **隐藏左侧边栏时，顶部左上角侧边栏开关按钮靠最左边（适配全屏与非 macOS）**
   - **根因**：`TopBar.tsx` 在 `!sidebarOpen` 时固定写死 `pl-20`（80px）给 macOS 窗口红绿灯留位；但在全屏模式下红绿灯会移出窗口顶部栏（或 Windows/Linux 无左上角红绿灯），导致按钮右侧孤立悬空 80px。
   - **方案**：由主进程向渲染进程同步窗口全屏状态（`enter-full-screen` / `leave-full-screen`）与平台标识；仅在「macOS 且非全屏且 `!sidebarOpen`」时保留红绿灯避让边距（`pl-[76px]`），全屏或非 macOS 收起侧边栏时统一贴左 `pl-3`。

4. **选中整行按 `Ctrl+B` 加粗出现额外空行的根因与方案**
   - **根因**：三击/拖拽选中整行时，选区尾部常带入 `<br>` 或 `\n`，`inlineFormat.ts` 将其一并提取进 `<strong>`（且 `contentEl` 带有 `data-newline="1"`），导致 `html2md` 序列化后在加粗标记内外产生多余换行形成空行。
   - **方案**：在 `toggleSingleRange` 提取 `extracted` 后、包裹进 `irSpan` 前，剥离片段首尾的尾随 `<br>` 与纯换行文本节点（或将其留在 `irSpan` 外部原位），并核查 `data-newline="1"` 对整行加粗序列化的影响，保证 `Ctrl+B` 只包裹文字本身、绝不新增空行。

5. **打包规范（待上述问题全部改完并确认后执行）**
   - **macOS**：用 `iconutil` 从 `build/icon.png` 生成标准多分辨率 `build/icon.icns`，配置 `electron-builder` DMG 拖拽安装布局（`Vmark.app` + `/Applications` 快捷方式坐标与图标），确保双击 DMG 即可直观拖入应用程序安装。
   - **Windows**：生成 `build/icon.ico`，配置 `win` 目标（`nsis` 安装包）及 `package:win` 脚本。
   - 本轮暂不执行打包，待功能全部验收确认后再统一出包。
