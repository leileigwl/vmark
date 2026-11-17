# Session Handoff（会话交接记录）

- **日期**：2026-11-17
- **当前阶段**：**Round 43 方案规划与文档更新（先改文档 → 写完测试 → 再改代码 → 持续回归）**
- **上一提交**：`fe1f515`（Round 42）

### Round 43 根因定位与修复规划
1. **`Ctrl/Cmd+X` 剪切把下方代码块 `text` 拉上来**（图 1）：
   - **真因**：未拦截 `cut` 事件，跨块/行尾三击选区剪切时浏览器原生删除会把下方代码块 `.vditor-ir__marker--info`（`text`）拉入上方引用/段落。
   - **方案**：新增 `handleEditorCutCapture`，复刻 Markdown 剪贴板写入并在跨受保护块选区或行尾剪切时隔离容器边界，绝不拉扯下方块。
2. **点击语言框 `ts` 莫名被锁、无法输入**（图 2）：
   - **真因**：`handleEditorMouseDownCapture` 点击 `infoSpan` 时调用了 `e.preventDefault()`，却未聚焦 `.vditor-reset`，导致选区虽高亮蓝色但编辑器无 DOM 焦点，键盘输入被锁。
   - **方案**：在选中 `infoSpan` 前显式执行 `resetEl.focus({ preventScroll: true })`，确保点击即聚焦可编辑。
3. **文档中间输入 ```` ``` ```` 光标跳过新建代码块**：
   - **真因**：`vditorKeyboard.ts` 展开代码块后取 `allCbs[allCbs.length - 1]`，导致在文档中间输入 ```` ``` ```` 时光标跳到文档最末尾的旧代码块，跳过新建代码块。
   - **方案**：改为通过当前选区 `anchorNode?.closest('.vditor-ir__node[data-type="code-block"]')` 精确定位刚插入的新代码块。

### Round 41 E2E 实测暴露并根治的隐藏真因
1. **列表/引用按空格不渲染的隐藏真因**：Vditor IR 的编辑区根节点本身是 `<pre class="vditor-reset">`，导致 `anchorEl.closest('pre, ...')` 对所有普通段落全部返回 `PRE`，彻底屏蔽了空格即刻渲染与 `>` 延迟编译；已全面替换为 `pre:not(.vditor-reset)`。
2. **`/table` 点击确定不插入的真因**：`VditorEditor.tsx` 传入了 `containerRef.current?.querySelector('.vditor')`（返回 `null`），已改为 `containerRef.current` 并补充确认后自动关闭弹窗。
3. **代码块语言 hint `Tab`/`Enter` 检测**：`hintEl.offsetParent !== null` 对 `position: fixed` 弹窗返回 `false`，改为 `hintEl.getBoundingClientRect().height > 0`。
4. **空标题失焦保持大号黑体**：`vditorDomEnhancer` 为无正文标题打上 `data-vcat-empty-heading="1"`，CSS 保持 `.vditor-ir__marker--heading` 继承标题大号粗体且不消失。

---

## Round 40 深度测试与调试发现清单

通过 Node 直接实测 `lute.SpinVditorIRDOM`、CSS 级联排查与全路径事件审计，定位以下 4 类核心问题：

### 1. 有序列表（`1.` + 空格）与无序列表（`-` / `*` + 空格）显示不出来的真实根因
- **Lute 实测结果**：使用 `node` 直接运行 `lute.SpinVditorIRDOM('<p data-block="0">1. <wbr></p>')` 与 `'- <wbr>'`，确认 Lute 已正确返回 `<ol data-tight="true" data-marker="1." data-block="0"><li data-marker="1."><wbr></li></ol>` 与 `<ul ...><li data-marker="-"><wbr></li></ul>`。
- **真因 A（CSS 被 Tailwind Preflight 吞没）**：全局样式引入的 Tailwind Preflight 默认对所有 `ol, ul` 设置了 `list-style: none;`，而 `editor.css` 仅设置了 `padding-left: 1.6em` 与 `::marker` 颜色，**漏掉了 `list-style-type: decimal !important`（有序列表）与 `list-style-type: disc !important`（无序列表）及嵌套层级 `circle` / `square`**，导致编号与圆点完全不可见。
- **真因 B（空 `<li>` 塌陷与容器误判）**：`wbr.remove()` 后新建的 `<li></li>` 内部没有任何子节点，Chromium 下空 `<li>` 易发生行高塌陷与光标不可见，需补入 `<br>` 占位；同时 `curBlock` 需排除 `.vditor-reset` 自身，避免极端空文档下误替换整个编辑器根节点。
- **任务列表兼容**：`li.vditor-task` 必须显式保留 `list-style: none !important`，避免复选框旁边多出圆点。

### 2. 拖拽（Drag & Drop）与跨块拖选删除的隔离漏洞
- **拖拽漏洞**：编辑器内尚未拦截 `.vditor-ir__marker--info`（语言标签）与 `.vditor-copy` 的 `dragstart` / `drop`，拖拽语言标签或把文本拖入语言标签会直接撕裂代码块外壳。
- **跨块选区删除漏洞**：当前仅保护了**同一代码块内部**的选区删除（`startTop === endTop`）；当用户从代码块/引用块**跨块拖选**到相邻段落（`startTop !== endTop`）再按 `Backspace` 或 `Delete` 时，浏览器原生删除会把局部 `<pre><code>` / `<blockquote>` 与普通 `<p>` 强行合并，导致格式撕裂。

### 3. `Delete` 键在受保护块上方段落末尾向下吞并漏洞
- 当前仅拦截了「受保护块下方段落行首按 `Backspace` 向上吞并」；当光标位于代码块 / 引用块 / 表格**上方**普通段落末尾按 `Delete` 时，浏览器原生前向删除同样会把下方的受保护块拉进 `<p>` 中撕毁。

### 4. Round 40 实施与验证计划
1. **CSS 修复**（`editor.css`）：恢复 `.vditor-reset ol` (`decimal`)、`.vditor-reset ul` (`disc` / `circle` / `square`)、`.vditor-reset li.vditor-task` (`none`) 与嵌套列表样式。
2. **空格渲染与空 `<li>` 兜底**（`vditorKeyboard.ts`）：排除 `.vditor-reset` 误替换，空 `<li>` 自动补 `<br>` 保证编号与光标立即可见。
3. **拖拽与跨块/Delete 全隔离**（`vditorPointerEvents.ts` + `vditorKeyboard.ts`）：
   - 禁止 `dragstart` 拖走 `.vditor-ir__marker--info` 及向其 `drop`；
   - 拦截跨受保护块选区删除（`startTop !== endTop`）与受保护块上方段落末尾 `Delete` 吞并。
4. **验证**：运行 `pnpm typecheck && pnpm test && pnpm --filter @vcat/desktop build`，并结合真实 DOM/Lute 测试用例验证后本地提交。

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
