# Proposal

## Why

随着 `vmark` 演进为公开开源项目，并需支持「单 Antigravity 主窗口统筹（主控本身也可能切换为 Gemini 3.8 Flash 等低成本小模型） + 多小模型 Worker 高并发并行 + 每日极简高速迭代」，现有研发脚手架（Harness）与 CI/CD 体系已暴露出以下系统性瓶颈：

1. **多 Agent 并行总合流路口冲突与巨型枢纽磁铁**：尽管 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 约定了 500–600 行解耦红线，但仓库中已出现 7 个超标文件，特别是 [App.tsx](apps/desktop/src/renderer/src/App.tsx)（1393 行）、[main/index.ts](apps/desktop/src/main/index.ts)（1303 行）、[VditorEditor.tsx](apps/desktop/src/renderer/src/components/VditorEditor.tsx)（1157 行）、[vditorKeyboard.ts](apps/desktop/src/renderer/src/editor/vditorKeyboard.ts)（991 行）、[publishHandlers.ts](apps/desktop/src/main/publishHandlers.ts)（871 行）、[Sidebar.tsx](apps/desktop/src/renderer/src/components/Sidebar.tsx)（867 行）和 [SettingsView.tsx](apps/desktop/src/renderer/src/components/SettingsView.tsx)（637 行）。多个并行 Agent 修改不同业务特性时仍会共同撞入枢纽文件与隐性接缝，造成合流冲突。
2. **纯 Markdown 软约束与纯路径分级无法压制低配/小模型漂移**：当主控或 Worker 直接切换为如 3.8 Flash 这类小模型时，仅靠 MD 文档与文件名规则必然出现规则遗忘、越界改底座代码、导出签名/IPC/安全语义悄悄变味却未触发高风险门禁、通过 `.skip`/删断言/新增 `as any` 作弊过测试或“假完成”退出，以及高频产生 AI Slop。
3. **缺少“一次性改到位 → 底座锁定后极简日常”两阶段保护**：当前可大刀阔斧重构架构，但日常稳态高频迭代期必须用机械门禁锁死核心底座，防止后续 AI 在常规需求里顺手乱改框架与规范。
4. **测试分层断层与跨项目后端压测复用缺失**：当前 45 个纯 Node 单测与 21 个 Playwright E2E（[playwright.config.ts](apps/desktop/playwright.config.ts) 仅测 `vite preview` 渲染层 Mock）之间缺少 **`main ↔ preload ↔ renderer` IPC 契约测试**、**L0 架构/反作弊守卫**及 **Ubuntu `xvfb-run` 真实 Electron 冒烟测试**，同时缺乏针对未来互联网后端项目可一键复用的可执行 Harness 初始化脚手架与冒烟/压测模板。
5. **文档与 OpenSpec SSOT 腐化、单窗口异步通知闭环缺失及公开合规缺口**：[AGENTS.md](AGENTS.md) 混入旧 Round 27 临时方案、[session-handoff.md](docs/session-handoff.md) 停在 Round 44、[docs/02-design/](docs/02-design) 堆积 10 份重叠设计稿、`openspec/changes/init-cat-publisher` 停留在 `0/13` 未归档；现行 [ci.yml](.github/workflows/ci.yml) 在 `macos-latest` 跑单 Job 串行任务；每周 Cron、回归告警与每日指标尚不能通过 GitHub `@mention` 邮件反推至用户单窗口；`leileigwl/vmark` 仍为 `private` 且缺少商业付费双授权协议。

## What Changes

围绕「Stage A 一次性改到位 + Stage B 锁定底座后的极简高速并发日常 + 可跨项目一键初始化的可执行 Harness Kit（支持 `desktop-electron` 与 `web-service` Profile）」，重构研发与自动化流水线如下：

- **主控小模型兼容的原生生命周期 Hook 硬锁（兼容 3.8 Flash 等多 Agent）**：落地 `.agents/hooks.json`（`SessionStart`/`PreToolUse`/`PostToolUse`/`Stop`）、`.claude/settings.json` 与 `.githooks/` 三端共享的 `scripts/harness/hook-adapter.ts`。小模型开局自动注入当前状态；未冻结契约、越界改 `ownedPaths`、锁定态改动框架均在 `PreToolUse` 直接 `deny`；`Stop` 拦截未过机械检验的“假完成”，从运行时物理上让小模型跑不偏。
- **两阶段生命周期（Bootstrap 一次性落地 → `bootstrapLocked: true` 底座封锁）**：在 `.harness/project.json` 引入 `bootstrapLocked` 开关。Stage A 完成架构拆分、Harness 引擎与 CI/CD 全量落盘后锁为 `true`；日常期任何 Agent 均不可修改底座（`.harness/`、`scripts/harness/`、`.agents/`、`.github/`、`packages/shared/` 契约核心），仅人工显式执行 `pnpm harness:unlock-bootstrap` 才可再次大改框架。
- **物理模块岛拆分 + AST 三层确定性风险检测（去纯 MD 依赖）**：在 `scripts/harness/` 实现 `arch-graph.ts`（TS Compiler API 扫描垂直物理模块岛：仅允许 Barrel `index.ts` 导入、禁止跨岛深层引用与循环依赖，使并行拆分天然零撞车）与 `risk-classifier.ts`（Path 规则 + TS AST 公共接口/签名变化 + Diff 敏感语义信号三层判定，不再仅靠 MD 或文件路径区分风险）。
- **双轨硬状态机、契约冻结与互斥切片并发**：Consort 风格双轨状态机（UI 大改版完整轨 vs 快轨）；通过 `pnpm harness:plan-slices` 与 `.harness/slices/*.json` 校验互斥 `ownedPaths` 及 `<300` 行上限，支持多小模型在独立 Worktree + 随机端口下高并发开发；连续 2 次门禁失败自动置 `status: "escalated"` 熔断交大 AI 接管。
- **三层文档 SSOT 防腐 + 1 页操作手册**：宪法层（[AGENTS.md](AGENTS.md) 瘦身 ≤100 行、[docs/PRODUCT.md](docs/PRODUCT.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)）、变更契约层（`openspec/` 归档闭环，归档历史 `init-cat-publisher` 与重叠 `docs/02-design/*`）、覆盖式快照层（[docs/session-handoff.md](docs/session-handoff.md)），并新增单窗口日常速查手册 `docs/OPERATOR_PLAYBOOK.md`。
- **反作弊、行数棘轮与 5 类 AI Slop 三级熵减 + GitHub 邮件反推闭环**：PR 硬锁 + 7 个历史超标文件行数棘轮；每周 Cron `slop-audit.yml`、合流 `auto-revert.yml` 与每日 21:00 CST Drain & Freeze `daily-release-pr.yml`（内嵌每日 5 大核心指标仪表盘）均自动 `@leileigwl` 触发 GitHub 邮件反推，用户在唯一窗口凭一句话即可拉起并发治理。
- **五层测试金字塔（L0–L4）与可执行跨项目 `init-project` Harness Kit**：新增 L0（架构/AST/反作弊）、L1（单测 + `main ↔ preload ↔ renderer` IPC 契约）、L2（动态端口隔离 Web Playwright）、L3（`desktop-electron` 真 Electron `xvfb-run` 冒烟；`web-service` 交付可执行 `k6-smoke.js` 压测、DB Migration `up/down` 脚本与容器冒烟模板）及 L4 实机隔离；提供 `scripts/harness/init-project.ts` 供新项目一键复用。
- **风险分级自动合并 CI/CD、Fork 安全隔离 AI Review 与 AGPL-3.0 商业双授权公开**：日常 CI 全迁 `ubuntu-latest` 并行（仅 `v*` Tag 三端发版）；`concurrency: merge-test` 串行合流 + Drain & Freeze + Merge Commit 同步防分叉；两段式（`pull_request` + `workflow_run`）隔离 Secrets 跑 DeepSeek/OpenAI 可插拔 Review（单向调高风险），外部 Fork PR 同享全面审查但永不自动合入；**BREAKING** —— 切 Public 前执行全历史敏感扫描并落盘 **AGPL-3.0-only + 商业付费双授权**（`LICENSE` + `LICENSE-COMMERCIAL.md`）。

## Capabilities

### New Capabilities

- `harness/state-machine-and-routing`: Consort 风格双轨硬状态机、契约冻结与互斥切片并行规划、主控小模型兼容的原生生命周期 Hook 硬锁、`bootstrapLocked` 两阶段底座封锁、大小模型路由及 2 次失败熔断机制。
- `harness/guardrails-and-slop-governance`: 代码级 Harness CLI 护栏、物理模块岛 Barrel-Only 与 AST 无环 DAG 守卫、反作弊与文件行数棘轮、5 类 AI Slop 识别与三级熵减流水线、三层文档 SSOT 防腐，以及可执行 `init-project` 跨项目 Harness 工具包。
- `testing/tiered-verification-pyramid`: 五层按风险触发的测试金字塔（L0 架构/AST 守卫、L1 单测与 IPC 契约、L2 并发端口隔离 E2E、L3 真实运行时集成冒烟、L4 实机隔离）及 `desktop-electron` / `web-service` 双 Profile 可执行验证模板（含后端容器冒烟、`k6` 压测脚本与 DB 迁移回滚脚本）。
- `cicd/risk-tiered-automerge-and-review`: Path + AST + 语义三层风险判定、Ubuntu 并行 CI 与 `concurrency: merge-test` 串行合流锁、信任分支分级自动合入与 `/approve` 门禁、Drain & Freeze 每日零冲突汇总与 5 指标 GitHub `@mention` 邮件反推、Safe Auto-Revert、Fork 安全隔离 AI Review 及 AGPL-3.0 商业双授权合规公开。

### Modified Capabilities

<!-- 当前 openspec/specs/ 为空；既有业务能力将在 Phase 0 从 init-cat-publisher 与现状代码回补至 openspec/specs/ 后统一建档 -->

## Impact

- **原生 Agent 集成与 Harness 引擎**：新增 `.agents/hooks.json`、`.claude/settings.json`、`.githooks/`、`.harness/`（含 `schemas/`、`profiles/`、`project.json`、`state.json`、`ratchet.json`、`slices/`）与 `scripts/harness/`（含 `hook-adapter.ts`、`risk-classifier.ts`、`arch-graph.ts`、`init-project.ts` 等）。
- **文档架构与操作指南**：精简重构 [AGENTS.md](AGENTS.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与覆盖式 [docs/session-handoff.md](docs/session-handoff.md)；新增单窗口日常操作规范 `docs/OPERATOR_PLAYBOOK.md`；归档 [docs/02-design/](docs/02-design) 重叠稿与 `openspec/changes/init-cat-publisher`。
- **桌面端垂直模块岛与测试基础设施**：按物理模块岛拆分 [apps/desktop/src/main/index.ts](apps/desktop/src/main/index.ts) 与 [apps/desktop/src/renderer/src/App.tsx](apps/desktop/src/renderer/src/App.tsx) 等超标枢纽文件；升级 [apps/desktop/playwright.config.ts](apps/desktop/playwright.config.ts) 动态端口/Temp 隔离；新增 IPC 契约测试与 Electron L3 冒烟测试。
- **GitHub Actions、通知与许可合规**：重构 [.github/workflows/ci.yml](.github/workflows/ci.yml)，新增 `.github/risk-rules.yml`、`risk-gate.yml`、`daily-release-pr.yml`、`auto-revert.yml`、`ai-review.yml`、`slop-audit.yml` 与 `.github/PULL_REQUEST_TEMPLATE.md`；落盘 `LICENSE`（AGPL-3.0-only）+ `LICENSE-COMMERCIAL.md` 并配置 `leileigwl/vmark` 标签、分支保护与 Public 可见性。
