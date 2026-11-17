# Session Handoff（会话交接记录）

- **日期**：2026-11-17
- **当前阶段**：**Round 38 已完成全部 7 项物理根治与全量构建验证**
- **上一提交**：`96adcb0`（Round 37）
- **本轮验证**：`pnpm typecheck`（5/5 packages）、`pnpm test`（8/8 tests）、`pnpm --filter @vcat/desktop build` 全部通过。

---

## 一、Round 37 遗留未闭环的物理真因审计

| 问题编号 | 用户现象 | 之前没做好的真实代码根因 | Round 38 终极根治方案 |
| :--- | :--- | :--- | :--- |
| **1. 代码块与空 Callout 删除崩坏**（图 7/8/10） | 代码块删不掉，或删除时语言标签和 mac 红黄绿圆点撕裂散落到正文里；空 Callout 删不掉。 | `vditorKeyboard.ts` 用 `topBlock.textContent` 判断是否为空，但 Vditor 代码块包含 `` ``` `` 和语言标签文本（如 `ts`），导致空代码块 `rawText` 永不为 0；放行给浏览器原生退格后，浏览器把 `<code>` 合并进了 `.vditor-ir__marker--info`，撕毁代码块外壳。 | 1. 精确检测代码正文 `pre > code` 的纯文本，若正文为空且在开头按 Backspace，拦截默认行为并将整个代码块安全移除/转为空白 `<p>`；<br>2. 若正文有内容但在 `code` 第一行行首按 Backspace，坚决拦截防止合并进语言标签；<br>3. Callout（`blockquote`）仅检查内部正文 `<p>`，若已删空则安全清除该 Callout。 |
| **2. 有序/无序/任务列表/引用空格不触发渲染 & 引用嵌套** | 键入 `1.`、`-`、`*`、`>`、`[]` 后按空格，没有立即变成列表/引用，或者在 `>` 内输入 `1.` 空格失效。 | 查阅 `node_modules/vditor/src/ts/ir/input.ts` 源码发现：Vditor 原生在 `endSpace === true` 时直接 `return` 跳过了 `SpinVditorIRDOM`（仅放行了 `# `）；而之前调用 `instance.insertValue('1. ')` 同样被 `endSpace` 拦截，导致根本不渲染。 | **直连 Vditor 原生 `SpinVditorIRDOM` + `<wbr>` 机制**：<br>1. 敲空格时插入 `<wbr>` 光标锚点，获取外层块（若在 `blockquote` 内则取 `blockquote` 整体）；<br>2. 调用 `vditor.lute.SpinVditorIRDOM(html)` 编译为合法 IR DOM 替换并调用 Vditor 的 `setRangeByWbr` 还原光标 + `pushVditorUndo`，同时在 `editor.css` 强化多级嵌套列表样式。 |
| **3. 反引号 3 击展开代码块残留反引号**（图 6） | 第 1 下成对，第 2 下紧邻打 1 个，第 3 下展开代码块时，上方或下方残留多余反引号 `` `` ``。 | 第 1 下成对产生 `` `|` ``，第 2 下变成 `` ``|` ``，第 3 下只删除了光标**左侧**的 2 个反引号，**光标右侧自动补全的那个 `` ` `` 没有清理**，导致残留 `` ` ``；且 `insertValue` 插入时若当前行非空会导致解析失败。 | 第 3 下触发时：**同时清理光标左侧 2 个及紧邻右侧的 1 个自动补全反引号**，再通过 `SpinVditorIRDOM` 或清理当前空段落后插入 ` ```ts\n\n```\n ` 并聚焦语言框，零残留。 |
| **4. 表格暗黑适配 + 必定生成 + 行数精确**（图 4/9） | 暗黑下弹窗白底白字；确定后表格没插进去；选 4 行出现 5 行（表头+4行）。 | 1. 弹出 Modal 后焦点转移，`placeholder.remove()` 先把选中节点删掉导致 Range 瞬间坍缩失效，`instance.insertValue` 找不到有效选区；<br>2. 行数逻辑 `rows - 1` 与表头混算且 `Math.max(1, rows - 1)` 导致边界出错；<br>3. 暗黑 CSS 变量未覆盖自定义/部分暗黑主题。 | 1. 弹窗期间保留 `<span id="vcat-table-placeholder"></span>` 作为锚点，确定时用 `lute.Md2VditorIRDOM(tableMd)` 直接 `placeholder.closest('p')?.replaceWith(...)` 替换整行并聚焦首个单元格；<br>2. 明确“总行数 = 1 表头 + (rows - 1) 数据行”（最小 2 行或按总行准确生成）；<br>3. `TableSizePicker` 增加动态暗黑样式检测兜底。 |
| **5. 全行内格式空状态去胶囊**（图 5） | `****` 空加粗、空斜体、空删除线、空行内代码中间仍有绿色胶囊小方块。 | CSS `:empty` 伪类失效！因为 Vditor IR 会在空 `<strong>` / `<em>` / `<code>` 里插入零宽空格 `\u200b` 或 `<br>`，导致 `:empty` 根本匹配不到！ | 在 `vditorDomEnhancer.ts` 中统一遍历行内标签（`strong, b, em, i, s, del, code`），去掉 `\u200b` 后长度为 0 时打上 `data-vcat-empty="1"`，CSS 对 `[data-vcat-empty="1"]` 强制透明无边距。 |
| **6. 代码块语言选完按 Enter 直切正文第 1 行** | 选完语言按回车光标仍在语言框或丢失。 | 语言框提交后 Vditor 会重绘或折叠代码块，紧接着 `requestAnimationFrame` 里找的 `codeBody` 已被重绘或未聚焦。 | 先 `commitCodeBlockLanguage`，等微任务/下一帧重新从 DOM 查询最新 `codeBody`，确保 `codeBlock` 保持展开态并精确将光标落入 `code` 首行。 |
| **7. 侧边栏搜索结果点击精准定位**（图 2） | 点击搜索结果切换文章后未滚到关键词位置。 | 文章切换是异步加载 + Vditor 初始化重绘，轮询时如果文章还没 `setValue` 完成，`jumpToMatch` 匹配到的是旧文章或空 DOM。 | 绑定 `loadSeq` / 目标文章路径校验，确认新文章内容已渲染进 `.vditor-reset` 后再执行 `jumpToMatch` 高亮并 `scrollIntoView({ block: 'center' })`。 |

---

## 二、实施时间规划（约 60 分钟闭环）

1. **阶段 1（15 min）**：重写 `vditorKeyboard.ts` 退格保护（精确区分 `code` 正文为空 vs 有内容、Callout 正文为空 vs 有内容）与反引号三步状态机（清理两侧残留反引号）。
2. **阶段 2（15 min）**：基于 `SpinVditorIRDOM` + `<wbr>` 重写空格即刻触发渲染（`1.`、`-`、`*`、`>`、`[]` 及 `>` 内嵌套 `1.`），并完善 `editor.css` 列表缩进与嵌套样式。
3. **阶段 3（10 min）**：修复 `vditorDomEnhancer.ts` + `editor.css`，用 `data-vcat-empty="1"` 彻底根治所有行内格式空胶囊；修复 `TableSizePicker.tsx` 暗黑兜底与 `vditorCommands.ts` 占位符整行替换生成表格。
4. **阶段 4（10 min）**：修复代码块语言回车直切正文与侧边栏搜索定位精确校验。
5. **阶段 5（10 min）**：全量 `pnpm typecheck`、`pnpm test`、`pnpm --filter @vcat/desktop build` 验证，并在无误后提交 Git。
