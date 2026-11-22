# Session Handoff（覆盖式进度快照）

> 本文件实行 **覆盖式快照规范（硬上限 ≤ 120 行）**，禁止无限追加过时轮次流水账。完整历史需求截图根因、交互原型与测试用例映射台账均留存在 [`docs/requirement-journal.html`](requirement-journal.html) 中。

- **快照日期**：2026-11-21
- **当前分支与里程碑**：`slice/browser-hub-and-card-fixes`（基于 `test` @ `017cec9`）——**纯写作台独立保留 + 分发内置多标签/宫格沙箱浏览器 + 小红书卡片防裁切/表格转化 + 图床精简与 CSDN/博客园草稿修复**
- **最新基线版本**：`v0.1.0`（`master` @ `5c51dde` / `test` @ `017cec9`）
- **护栏约束**：红黄绿路径与单文件 `<= 500` 行边界详见 [OPERATOR_PLAYBOOK.md](OPERATOR_PLAYBOOK.md)

## 本轮已完成整改（REQ-05 ~ REQ-08）

1. **纯写作台独立 + 分发口直达内置多标签/宫格沙箱浏览器**：
   - 主窗口保持纯粹独立的 Markdown 写作台，不侵入主写作区；在「合并分发」弹窗新增 **`🌐 平台快捷浏览器`** 宫格入口（11 平台图标与实时授权状态），并在「多平台分发 / Git」新增 **全选已授权 / 全选全部 / 清空** 及单平台 **`内置浏览器`** 按钮。
   - **修复草稿链接跳出外部无登录浏览器问题**：`PublishResultRow.tsx` 拦截草稿链接点击事件并调起内置沙箱浏览器，携带独立 `persist:platform_*` Cookie 直开草稿箱。
   - **升级内置浏览器顶栏为横向多标签 Tab 栏**：`internalBrowserManager.ts` 顶栏直接切换 11 个平台独立沙箱会话与地址栏。
2. **小红书/抖音流式文字卡片排版修复**：
   - `xiaohongshuRenderer.ts` 新增 `normalizeMarkdownTablesAndRules`，彻底清除 `---` 分割线与 `| :--- |` 原始表格乱码，自动将 Markdown 表格转为可读结构化要点列表，并消除首段重复卡片。
   - `PlatformPreviewPane.tsx` 为标题、引用框、顶栏与页码加上 `shrink-0` 与合理行高，消除文字纵向腰斩裁切。
3. **偏好设置精简与 CSDN/博客园接口修复**：
   - `SettingsImageBedSection.tsx` 隐藏「通用云图床（PicGo-Core / OSS）」表单，仅保留图片默认比例与官方平台图床直传。
   - `publishPlatformDispatch.ts`（CSDN 补充语义 `html` 内容防报「请输入内容」）与 `publishCnblogsDraft.ts`（预热并解码 `XSRF-TOKEN` 解决会话校验失败）。
4. **需求与测试用例同步台账**：
   - 更新 `docs/requirement-journal.html`，将各需求痛点、原型交互与同步更新的单测/E2E 用例（`socialCard.test.ts`、`settings.spec.ts`、`publish.spec.ts`）建档留存，随时可回看。

## 验证边界诚实声明（L1–L4 严格分层）

- **L0/L1**：`pnpm harness:check --json`、`pnpm run typecheck`、`pnpm turbo run test`。
- **L2**：`pnpm --filter @vcat/desktop exec playwright test --reporter=list`（同步覆盖图床隐藏、卡片表格清洗、批量全选与内置浏览器调起）。
- **L3**：`apps/desktop/tests/electron-smoke.spec.ts` 在 CI 拉起真实 `electron`。
