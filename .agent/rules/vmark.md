---
trigger: always_on
description: "Vmark 仓库硬规则：PR 大小、测试先行、草稿 PR、受保护路径、UI 组件与令牌、只推草稿箱、凭据不落日志、PR 正文格式。"
---

# Vmark 工作规则（Antigravity）

> 与 [AGENTS.md](../../AGENTS.md) 一致，AGENTS.md 优先；改哪里影响什么见 [docs/CHANGE_MAP.md](../../docs/CHANGE_MAP.md)。
> 放在旧路径 `.agent/rules/`：Antigravity 现行路径是 `.agents/rules/`（仍兼容读取 `.agent/rules/`），但 `.agents/` 属于底座锁定/高风险目录，需维护者解锁后再迁移。

## PR
- 每个 PR ≤ 600 行可审改动、只做一件事、只落在一层（shared / main / preload / adapters / core / renderer / docs）；小模型切片仍按 AGENTS.md 的 < 300 行。
- 一律开**草稿 PR**，目标分支 `test`；不要自己标记 ready、不要合并、不要 force-push `test` / `master`。
- 跨层功能按 契约 → 主进程/适配器 → core → 界面 → 文档 拆成堆叠 PR（见 CHANGE_MAP「一个功能怎么拆 PR」）。
- PR 正文三段（中文）：**改了什么**（文件 + 原因）/ **怎么验证**（贴命令真实输出，写明 L2 Mock E2E、L3 真 Electron、L4 真平台跑到哪一层）/ **怎么回退**。并链接 `docs/CHANGE_MAP.md` 中对应的层。

## 测试先行
- 先写会失败的测试，贴失败输出，再改实现，贴通过输出。
- 必跑：`pnpm harness:check --json`、`pnpm run typecheck`、`pnpm turbo run test`、`pnpm --filter @vcat/desktop build`、Playwright E2E（`NO_PROXY=127.0.0.1,localhost`）。high 风险再跑 `xvfb-run -a pnpm --filter @vcat/desktop test:electron-smoke`。
- 严禁 `.skip`、删断言、`as any`、把 Mock 测试说成真 Electron / 真平台通过。行为确实变了要改断言时，在 PR 里写明原因。
- 同一问题连续 2 次没过门禁就停下，报告卡点，不要盲改。

## 受保护路径（不要改）
- `.github/**`、`.harness/**`、`scripts/harness/**`、`.agents/**`、`.claude/settings.json`、`.githooks/**`、`AGENTS.md`、`LICENSE*`：需要维护者先执行 `pnpm harness:unlock-bootstrap`。
- 根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`packages/shared/**`：high 风险，只有任务明确要求时才改；`packages/shared` 只加可选字段。
- 依赖只加在用到它的 workspace 包里（如 `apps/desktop/package.json`），只用 `pnpm`。

## 产品与安全红线
- **只推草稿箱**：平台默认草稿模式，保留创作者人工确认；不改合规与错峰边界。GitHub 博客是唯一直发的自有站点。
- **凭据零外泄**：Cookie / Token / API Key 只在主进程处理，不写进日志、不传给渲染进程、不写进测试快照或截图。
- 读写用户文件前做工作区越界检查（`path.resolve` 后校验在工作区内），不修改用户 `.md` 原文里的相对路径。
- 编辑器底线：输入不能莫名换行、丢字、吞输入法组字；改编辑器必须跑全部编辑器 E2E。

## UI
- 只用 `apps/desktop/src/renderer/src/ui/` 里的组件（Button、Input、Dialog、Checkbox、Switch、Badge、Tooltip、MoreMenu…），不写裸 `<button>`。
- 颜色只用语义令牌类（`bg-canvas`、`text-ink`、`text-muted`、`border-line`、`bg-primary`、`*-soft`…，定义在 `styles/ui-tokens.css`），不写十六进制色和行内 style（动态几何除外）。规范见 `docs/UI_GUIDE.md`。
- 界面改动附浅色 + 深色截图：图片推到 `pr-assets` 分支（`pr-assets/<分支名>/xxx.png`），PR 里用 raw 链接引用，不要把截图提交进功能分支。

## 结构
- 新文件 ≤ 500 行；`.harness/ratchet.json` 里的大文件只减不增。
- 主进程按域放 `src/main/ipc/<domain>/`，渲染层按域放 `src/renderer/src/features/<domain>/`，跨岛只经 `index.ts` 导入；渲染层不导入 `main/**`、`electron`、`node:fs`。
- 新增 IPC 通道要同时改 `packages/shared/src/ipcContract.ts`、preload、主进程注册，并通过 `tests/ipcContract.test.ts`。
