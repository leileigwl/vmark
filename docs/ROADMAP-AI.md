# ROADMAP-AI.md：Vmark 后续开发任务卡（给 AI 读）

> 用法：先读 `CLAUDE.md`。用 `/vm-next` 挑任务，`/vm-plan T<编号>` 出计划，维护者确认后 `/vm-build`。
> 每完成或开 PR，把任务卡的「状态」改掉（`/vm-handoff` 会做）。新发现的问题追加到末尾，编号顺延。
> 基线：`preview/latest` @ 2026-11-24（`8914913` 之后）。所有改动目前只在 Linux 无头 Chromium + node 测试和 Linux 真 Electron（Xvfb）里验证过，**未在 macOS / Windows 真机验证**。

## 0. 现状快照（已完成，不要重做）

| 范围 | PR | 要点 |
|---|---|---|
| 公众号登录假阳性 | #87 | token 只认 `data:{t:"数字"}`，再请求后台首页二次确认 |
| 内置浏览器释放 | #88 | 清理挂在 `closed`，关闭两个 WebContentsView，保留登录 session |
| 发布弹窗内容区 | #89–#92 | 摘要超长提示并自动截取；标签共用、掘金单列；公众号只留封面 + 2.35:1/1:1 焦点裁剪；比例归位到平台块 |
| 全选可推送 | #86 | 「全选可推送」⇄「取消全选」，不含 GitHub 博客 |
| 数据完整性 | #93–#97 | `@smoke` 冒烟（字节级往返、全部快捷键、真 Electron 关窗/崩溃/写盘失败）；保存只写改过的行；原子写入；关窗前落盘 |
| 崩溃恢复 | #98 → #99 撤回 | 维护者决定暂不做；C2 用例保持 `test.fail` |
| AI 工作流 | #100、本 PR | `CLAUDE.md`、`REVIEW.md`、`.claude/agents`、`.claude/commands` |

## 任务卡格式

```
### T<编号> 标题
- 优先级：P0 / P1 / P2　状态：待做 / 等维护者 / 进行中 / 已开 PR #N / 完成
- 依赖：
- 目标：
- 背景：
- 相关文件：
- 先写的失败测试：
- 验收标准：
- 行数预算：
- 风险 / 锁定：
- 需要维护者真机确认：
```

---

## P0：安全与数据

### T1 凭据改用 safeStorage 加密存储
- 优先级：P0　状态：待做
- 依赖：无
- 目标：图床 Token、AccessKey/SecretKey 等不再明文写入 `userData/vcat-config.json`。
- 背景：AGENTS.md 红线「凭据仅限主进程 safeStorage 落库」。现在 `main/ipc/context.ts` 读写 `vcat-config.json`，`main/ipc/image-config/index.ts` 校验 `token`、`accessKey`、`secretKey` 等字段，这些值以明文落盘。
- 相关文件：`apps/desktop/src/main/ipc/context.ts`、`apps/desktop/src/main/ipc/image-config/index.ts`、新文件 `apps/desktop/src/main/secretStore.ts`（建议）。
- 先写的失败测试：node 单测——保存一份含 token 的配置后，读磁盘上的 `vcat-config.json` 原文，断言不含 token 明文；再读回配置，断言 token 正确。再加一条：旧版明文配置启动时被迁移为加密，迁移后明文消失。
- 验收标准：磁盘上无明文；旧配置自动迁移且功能不变；`safeStorage.isEncryptionAvailable()` 为 false 时不落盘密钥并在设置界面提示「本机无法安全保存密钥，本次仅在内存中使用」；渲染进程永远拿不到明文（只拿「已设置」状态）。
- 行数预算：~250。
- 风险 / 锁定：迁移失败不能丢掉用户其他配置；不碰 `packages/shared`（如需加字段先问）。
- 需要维护者真机确认：macOS 首次读取钥匙串是否弹窗；Windows DPAPI 正常。

### T2 Vditor 升级修 XSS
- 优先级：P0　状态：待做
- 依赖：无
- 目标：修掉 Vditor 3.11.3 媒体渲染的 XSS（GitHub 安全公告，4.0.1 起修复；动手前先在 Vditor 仓库 Security 页找到公告原文）。
- 背景：`apps/desktop/package.json` 写的是 `"vditor": "^3.10.9"`，锁文件解析到 3.11.3。4.x 是大版本，API 可能有变。
- 相关文件：`apps/desktop/package.json`、`pnpm-lock.yaml`、`apps/desktop/scripts/copy-vditor-assets.mjs`、`features/editor-ir/`。
- 先写的失败测试：L2 Playwright——打开含恶意媒体/iframe 片段的 Markdown（从公告里取 payload），断言预览渲染后 `window.__xss` 未被设置。
- 验收标准：XSS 用例通过；`@smoke` 全过（字节级往返、快捷键不变）；KaTeX、表格、任务列表、代码块渲染不退化。
- 行数预算：依赖升级本身很小；如 4.x API 变化导致改动 >600 行，先出拆分方案。
- 风险 / 锁定：先读 4.0.x 的 changelog 再动手；升级失败时备选方案是在 3.x 上对预览 HTML 做 DOMPurify 过滤（写在计划里让维护者选）。
- 需要维护者真机确认：打包版编辑器、预览正常。

### T3 Shift+Tab 不能反缩进列表
- 优先级：P1　状态：待做
- 依赖：无
- 目标：列表项里按 Shift+Tab 能减少一级缩进。
- 背景：`smoke-integrity-shortcuts.spec.ts` 里的 Shift+Tab 用例目前只断言「没有丢字」，因为反缩进不生效。
- 相关文件：`features/editor-ir/shortcutGuards.ts`、`features/editor-ir/index.ts`、`apps/desktop/tests/smoke-integrity-shortcuts.spec.ts`。
- 先写的失败测试：把该用例补上断言「二级列表项 Shift+Tab 后变为一级，文件其余内容逐字节不变」。
- 验收标准：上述断言通过；其他快捷键用例不变。
- 行数预算：<100。
- 需要维护者真机确认：macOS / Windows 各按一次。

### T4 编辑缩进代码块内部会丢整个代码块
- 优先级：P1　状态：待做（先调研）
- 依赖：无
- 目标：在 4 空格缩进的代码块里改字后保存，代码块不能消失。
- 背景：#94 让「没动过的」缩进代码块原样保留；但用户在块内编辑时，Vditor 的 `getValue()` 序列化不出这个块。
- 相关文件：#94 引入的「只写回改过的行」逻辑（`features/workspace-tree/` 下）、`features/editor-ir/index.ts`。
- 先写的失败测试：`@smoke` 用例——打开含缩进代码块的文件，在块内第二行末尾输入 `x`，保存，断言代码块所有行仍在、只多了一个 `x`。
- 验收标准：用例通过；其余 `@smoke` 全过。
- 行数预算：调研后定。
- 风险 / 锁定：`/vm-plan` 必须给出至少两个方案（例如：按行映射把块内编辑回写到原文；或检测到块丢失时拒绝覆盖并提示）并说明各自会不会改写用户格式。**不允许**偷偷把缩进代码块转成 ``` 围栏格式。

### T5 切换文件时未保存内容落盘
- 优先级：P1　状态：待做
- 依赖：无
- 目标：在 A 文件打字后立刻点开 B 文件，A 的最后输入不能丢。
- 背景：#55 时记录「卸载时 flush 延后」；#97 只处理了关窗/退出。
- 相关文件：`features/workspace-tree/index.ts`、`main/editorSafety.ts`。
- 先写的失败测试：`@smoke` L2——A 中输入后 100ms 内点 B，再读 A 的磁盘内容，断言包含输入。
- 验收标准：用例通过；不会把 A 的内容写进 B。
- 行数预算：<150。

## P1：真机验证后的修复（等维护者测试反馈）

### T6 小红书 / 抖音自动化选择器
- 优先级：P1　状态：等维护者
- 依赖：维护者真机测试结果
- 目标：按真机反馈修正 `main/socialDraftPage.ts` 的选择器与流程。
- 背景：选择器来自开源项目交叉核对，未在真账号验证。待确认项见 `docs/platform-rules-todo.md`「真机清单：小红书 / 抖音」：上传 input 能否被 CDP `setFileInputFiles` 触发、缩略图选择器、存草稿按钮文案、抖音单篇 30 还是 35 张。
- 做法：维护者用 `/vm-bug` 提交现象 + 页面 HTML 片段；AI 把片段存成 `tests/fixtures/*-publish.html` 新夹具，先让夹具测试失败，再修。
- 风险 / 锁定：改 `SOCIAL_MAX_CARDS`（`packages/shared/src/index.ts`）属于 shared，先问。

### T7 平台规则核实（platformSpecs verified）
- 优先级：P1　状态：等维护者
- 依赖：维护者登录各平台后台
- 目标：把 `docs/platform-rules-todo.md` 表里的待核实字段逐个确认，移到 `platformSpecSources.ts` 的 `SPEC_EVIDENCE`，全部确认的平台改 `verified: true`。
- 做法：维护者把后台看到的数字发给 AI；AI 只改 `platformSpecSources.ts` / `platformSpecs.ts`，`tests/platformSpecSources.test.ts` 必须过。每个平台一个小 PR。
- 重点：公众号标题 32 还是 64；掘金摘要 50–100 与标签数；抖音卡片上限。

### T8 「打开草稿」地址
- 优先级：P2　状态：等维护者
- 目标：确认知乎、百家号、微博、B 站草稿列表页地址，改 `main/draftLinks.ts`。

### T9 公众号登录检测真机回归
- 优先级：P1　状态：等维护者
- 目标：确认 #87 的两个假设：后台首页含 `data: { t: "<数字>" }`；Electron `session.fetch` 的最终 URL 带 `token=`。任一不成立，按维护者给的页面片段改 `packages/adapters/src/weixin.ts` 的解析并补夹具。

## P2：功能补齐

### T10 掘金分类运行时拉取
- 状态：待做。目标：发布弹窗的掘金分类从 `listCategories()` 运行时获取（经 IPC），失败时退回内置列表。文件：`packages/adapters/src/juejin.ts`、`main/ipc/publish/`、`features/publish-flow/CategoryPicker.tsx`。测试：IPC 返回新分类时界面显示新分类；IPC 失败时显示内置列表且不阻塞发布。

### T11 小红书 / 抖音话题从联想框点选
- 状态：等 T6。目标：`#话题` 在草稿里成为真正的话题，而不是正文末尾的纯文本。文件：`main/socialDraftPage.ts`。需要真机 HTML 夹具。

### T12 卡片里的长公式换行
- 状态：待做。目标：超宽的行间公式在卡片中缩放或换行，不溢出。文件：卡片渲染（`main/socialCardRasterizer.ts`、`main/socialCardMath.ts`）。测试：渲染含超长公式的样例，断言公式宽度不超过卡片内容区。

### T13 登录顶栏实时跟随主题
- 状态：待做。目标：内置浏览器打开时切换应用主题，顶栏立即变色（现在要重开才变）。文件：`main/loginWindowBar.ts`、`main/internalBrowserManager.ts`。需要浅色/深色截图。

### T14 Windows / Linux 上 Ctrl+S、Ctrl+N 触发两次
- 状态：待做。目标：菜单加速键和编辑器快捷键只触发一次。文件：`main/index.ts`（菜单）、`features/editor-ir/shortcutGuards.ts`。测试：L3 真 Electron 中按一次 Ctrl+S，断言保存 IPC 只被调用一次。

### T15 打包版 KaTeX 字体
- 状态：待做。目标：打包后卡片和编辑器里的公式字体能从 asar 加载。做法：写一个检查脚本，打包后列出 asar 内 `out/renderer/assets/KaTeX_*` 并在 CI 外手动运行；维护者真机打开含公式的文档确认。

### T16 公众号富文本复制保真
- 状态：待做（先调研）。目标：复制到公众号编辑器后样式不丢。先列出现在丢了哪些样式（标题、引用、代码块、表格），再定方案。

## 等维护者决定（AI 不要自行开工）

- **D1** #42「只传原图」开关要不要做。
- **D2** 老 PR 链路 #43–#70 与 `preview/latest` 重叠：AI 可以出一份「哪些 PR 已被 preview/latest 覆盖」的对照报告（比较 tree），但**不关闭、不评论任何 PR**。
- **D3** 超 600 行的 #43 / #48 / #64 / #85：拆分还是豁免。
- **D4** 博客园图片上传 400：维护者自己处理，AI 不碰。

## 新发现的问题（由 /vm-bug、/vm-handoff 追加）

（暂无）
