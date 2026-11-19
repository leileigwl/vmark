# Session Handoff（覆盖式进度快照）

> 本文件实行 **覆盖式快照规范（硬上限 ≤ 120 行）**，禁止无限追加过时轮次流水账。完整历史均留存在 Git Commit 与 `openspec/changes/archive/` 中。

- **快照日期**：2026-11-19
- **当前阶段**：**`master` 与 `test` 已同步基线 `0d5be0e`（PR #2 与 Release PR #3 已合入，全套 CI/CD 工作流已在默认分支 `master` 激活）**
- **最新基线版本**：`v0.1.0`（`master` @ `0d5be0e` / `test` @ `0d5be0e`）
- **当前底座锁状态**：`bootstrapLocked: true`（底座框架已硬锁定，日常仅按垂直物理模块岛并发开发；如需改框架须先执行 `pnpm harness:unlock-bootstrap`）
- **最近 Slop 巡检记录**：`slop-audit.yml`（Run `44492362530`）已生成/更新周报 Issue #4（标签 `slop:cleanup`，29 项历史待消化债务 + 6 个互斥清理切片）。

## 已完成里程碑

1. **开源合规、宪法文档收敛与操作手册（Phase 0）**：
   - 完成全 Git 历史敏感凭据/路径清理，落盘 **AGPL-3.0-only（`LICENSE`）+ 商业双授权（`LICENSE-COMMERCIAL.md`）**，`leileigwl/vmark` 已切换为 `PUBLIC`。
   - 收敛 [`AGENTS.md`](../AGENTS.md)（36 行）、[`docs/OPERATOR_PLAYBOOK.md`](OPERATOR_PLAYBOOK.md)、[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) 并归档 `init-cat-publisher`。
2. **确定性 Harness + 原生 Hook 硬锁（Phase 1）**：
   - `.harness/` Schema 与 `scripts/harness/`（`anti-cheat`、`ratchet`、`risk-classifier` Path+AST+语义三层、`arch-graph`、`slice-lock`、2 次失败 `escalated` 熔断）。
   - 接入 `.agents/hooks.json`、`.claude/settings.json` 与 `.githooks/`（`SessionStart`/`PreToolUse`/`PostToolUse`/`Stop`）。
3. **Ubuntu 分级 CI/CD 与邮件反推闭环（Phase 2 & 4）**：
   - `.github/risk-rules.yml` + `ci.yml`（L0/L1/L2 分片/L3 `xvfb-run` 全在 `ubuntu-latest`，日常 PR 零 `macos-latest` 启动）。
   - `risk-gate.yml`、`daily-release-pr.yml`（21:00 CST Drain & Freeze + 5 指标 + `@leileigwl`）、`auto-revert.yml`、Fork 安全隔离两段式 `ai-review.yml` + `ai-review-post.yml`、每周 `slop-audit.yml`（联动 `knip` + 5 类 Slop）。
   - 交付便携跨项目套件 `scripts/harness/init-project.ts` + `.harness/profiles/`（含 `web-service` Compose/迁移回滚/`k6-smoke.js`）。
4. **物理模块岛解耦与五层测试升级（Phase 3）**：
   - `packages/shared/src/ipcContract.ts` 三端 IPC 契约与 `ipcContract.test.ts`。
   - `apps/desktop/src/main/index.ts`（1303 -> 317 行）拆入 `ipc/<domain>/index.ts`；`apps/desktop/src/renderer/src/App.tsx`（1393 -> 413 行）拆入 `features/<domain>/index.ts`。

## 验证边界诚实声明（L1–L4 严格分层）

- **L0/L1（本地与 CI 确定性静态/单测）**：`pnpm harness:check`、`pnpm harness:test`、`pnpm run typecheck`、`pnpm turbo run test`（含 `ipcContract.test.ts` 与 Mock 适配器单测）。
- **L2（Mock IPC 渲染层 Web E2E）**：`apps/desktop/playwright.config.ts` 动态端口 + 独立临时目录 Playwright（21 条 E2E 用例），仅验证渲染与编辑体验，**不代表真实主进程或线上平台**。
- **L3（真实 Electron 主进程无头冒烟）**：`apps/desktop/tests/electron-smoke.spec.ts` 在本地与 Ubuntu CI（`xvfb-run`）拉起真实 `electron` 验证窗口渲染与 Main↔Preload↔Renderer IPC 往返。
- **L4（真实第三方平台线上联调）**：微信公众号、知乎、百家号等真实账号与线上草稿箱推送**未在 CI 自动执行**，仅在本地实机按需手动验收。

## 后续日常行动

1. 参考 [`docs/OPERATOR_PLAYBOOK.md`](OPERATOR_PLAYBOOK.md) 开展单窗口或并发切片日常迭代，结合 Issue #4 互斥切片按需消化历史债务；每晚 21:00 CST 查看 `test -> master` 汇总 PR 并 Merge Commit 发布。
