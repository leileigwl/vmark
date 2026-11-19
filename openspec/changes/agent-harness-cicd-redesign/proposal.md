# Proposal

## Why

随着 `vmark` 演进为公开开源项目，并需支持「单主窗口统筹 + 多小模型 Agent 高并发并行 + 每日高速迭代」，现有研发脚手架（Harness）与 CI/CD 体系已暴露出以下系统性瓶颈：

1. **多 Agent 并行总合流路口冲突与巨型枢纽磁铁**：尽管 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 约定了 500–600 行解耦红线，但仓库中已出现 7 个超标文件，特别是 [App.tsx](apps/desktop/src/renderer/src/App.tsx)（1393 行）、[main/index.ts](apps/desktop/src/main/index.ts)（1303 行）、[VditorEditor.tsx](apps/desktop/src/renderer/src/components/VditorEditor.tsx)（1157 行）、[vditorKeyboard.ts](apps/desktop/src/renderer/src/editor/vditorKeyboard.ts)（991 行）、[publishHandlers.ts](apps/desktop/src/main/publishHandlers.ts)（871 行）、[Sidebar.tsx](apps/desktop/src/renderer/src/components/Sidebar.tsx)（867 行）和 [SettingsView.tsx](apps/desktop/src/renderer/src/components/SettingsView.tsx)（637 行）。多个并行 Agent 修改不同业务特性时仍会共同撞入核心枢纽文件与隐性前后端接口接缝，造成合流冲突。
2. **纯 Markdown 软约束无法压制低配/小模型漂移与 AI Slop**：当开发主力和自动化审查下沉至低成本/小模型时，仅靠冗长文字提示词必然出现规则遗忘、越界改文件、通过 `.skip`/删断言/新增 `as any` 作弊过测试，以及高频产出的死代码、胶水复制与文档腐化（AI Slop 熵增）。
3. **测试分层断层（Mock 假绿风险）**：当前 45 个纯 Node 单测与 21 个 Playwright E2E（[playwright.config.ts](apps/desktop/playwright.config.ts) 仅挂载 `vite preview` 渲染层 Mock）之间缺少 **`main ↔ preload ↔ renderer` IPC 契约测试**、**L0 架构/反作弊守卫**及 **Ubuntu `xvfb-run` 真实 Electron 主进程冒烟测试**，无法在「先改前端并测完 → 再加强后端」流程中守住端到端接缝。
4. **文档与 OpenSpec 事实来源（SSOT）腐化**：[AGENTS.md](AGENTS.md) 混入过期 Round 27 临时方案、[session-handoff.md](docs/session-handoff.md) 停在 Round 44、[docs/02-design/](docs/02-design) 堆积 10 份重叠设计稿、`openspec/changes/init-cat-publisher` 停留在 `0/13` 未归档且 `openspec/specs/` 为空。
5. **CI 算力浪费与开源公开缺口**：现行 [ci.yml](.github/workflows/ci.yml) 在 `macos-latest` 跑单 Job 串行任务且无路径分流；`leileigwl/vmark` 在 GitHub 上仍为 `private`、无分支保护与自动删分支配置、缺少外部 Fork PR 安全隔离审查与商业付费双授权协议（AGPL-3.0 + 商业双授权）。

## What Changes

围绕「`vmark` 标杆落地 + 可复用跨项目标准层（兼容 `desktop-electron` 与未来互联网后端 `web-service` Profile）」，重构研发与自动化流水线如下：

- **代码级确定性 Harness 引擎（替代纯 MD 软约束）**：新建 `.harness/` 机器契约层（`project.json`、`state.json`、`ratchet.json`、`slices/*.json`）与统一校验 CLI `pnpm harness:*`（本地 Git Hook 与 GitHub CI 共用同一份代码）；[AGENTS.md](AGENTS.md) 瘦身为 ≤100 行的强制开机入口。
- **双轨硬状态机、契约冻结与大小模型路由**：落地 Consort 风格双轨状态机（UI 大改版走含交互原型审批的完整轨，常规改造与 Bugfix 走快轨）；大 AI 先合入「契约冻结 PR」（锁定 OpenSpec、共享类型契约与跨模块集成测试骨架）后再派发 `owned_paths` 严格互斥的切片卡供多个小模型在独立 `git worktree` 中高并发开工（单 PR diff < 300 行）；同一切片连续 2 次未通过机械门禁自动熔断并升级大 AI 接管。
- **三层文档 SSOT 与 OpenSpec 机械防腐**：确立宪法层（`AGENTS.md` + `docs/PRODUCT.md` + `docs/ARCHITECTURE.md`）、变更契约层（`openspec/changes/` 合并后强制归档并同步至 `openspec/specs/`）与覆盖式机器交接层（`docs/session-handoff.md`），归档现有重叠设计稿与历史 `init-cat-publisher`，并由 CI 自动拦截超行与死链。
- **反作弊守卫、行数棘轮（Ratchet）与 5 类 AI Slop 三级熵减**：建立覆盖死代码/孤儿导出（`knip`）、膨胀与胶水复制、类型腐化/调试残留、测试腐化与文档熵增的 5 类清单；通过 PR 硬锁阻断新增 Slop、对 7 个历史超标文件执行「只减不增」行数棘轮、每周 Cron 自动生成分类体检 Issue 并驱动 `<300` 行专职清理切片，逐步将枢纽文件解耦为插拔式注册表。
- **五层按风险触发测试金字塔（L0–L4）与跨项目后端压测规范**：新增 L0（架构/反作弊/Typecheck）、L1（包单测 + IPC 契约测试）、L2（Ubuntu 并行 Playwright + 动态端口/Temp 隔离）、L3（`desktop-electron` 跑 `xvfb-run` 真 Electron 主进程冒烟；`web-service` 规范涵盖容器依赖、DB Migration up/down 回滚、API 冒烟与 `k6` 压测门禁）及 L4（本地实机联调严格隔离）。
- **风险分级自动合并 CI/CD、Drain & Freeze 每日汇总与 Fork 安全隔离 AI Review**：基于 `.github/risk-rules.yml` 自动判定 `risk:low`/`risk:mid`/`risk:high`；日常 PR 全迁至 `ubuntu-latest` 并行跑，仅 `v*` Tag 唤醒三端发版；自有信任分支低/中风险自动 Squash 合入 `test`（高风险须 `leileigwl` 评论 `/approve`），并用 `concurrency: merge-test` 串行合流锁防撞车；每日 21:00 CST 执行「Drain & Freeze」生成零冲突 `test → master` 汇总 PR（Merge Commit 合入并同步回 `test`）；`test` 回归变红触发安全单次 Auto-Revert + 熔断；采用两段式（`pull_request` + `workflow_run`）隔离 Secrets 跑 DeepSeek/OpenAI 可插拔 Review（单向调高风险），外部 Fork PR 享有完整检查与 AI Review + CLA/DCO 提示但永不自动合入。
- **开源切 Public 合规前哨与 AGPL-3.0 + 商业双授权**：**BREAKING** —— 将开源授权明确为 **AGPL-3.0-only + 商业付费双授权**（`LICENSE` + `LICENSE-COMMERCIAL.md`），并在切换仓库为 Public 前强制完成 Git 全历史密钥/Cookie/本地路径扫描与 GitHub 仓库治理配置。

## Capabilities

### New Capabilities

- `harness/state-machine-and-routing`: Consort 风格双轨硬状态机、契约冻结前置校验、互斥路径切片卡（`owned_paths`）、独立 Worktree 并发隔离、大小模型路由矩阵与连续失败熔断升级机制。
- `harness/guardrails-and-slop-governance`: 代码级 Harness CLI 护栏、反作弊测试/类型守卫、文件行数棘轮（Ratchet）、5 类 AI Slop 识别与三级熵减流水线，以及三层文档/OpenSpec SSOT 机械防腐机制。
- `testing/tiered-verification-pyramid`: 五层按风险触发的测试金字塔（L0 架构守卫、L1 单测与 IPC 契约、L2 并发安全 E2E、L3 真实运行时集成冒烟、L4 实机隔离）及 `desktop-electron` / `web-service` 双 Profile 验证规范（含后端冒烟、`k6` 压测与 DB 迁移回滚标准）。
- `cicd/risk-tiered-automerge-and-review`: `.github/risk-rules.yml` 风险分级判定、Ubuntu 并行 CI 与 `concurrency: merge-test` 串行合流锁、信任分支分级自动合入与 `/approve` 门禁、Drain & Freeze 每日零冲突 `test → master` 汇总、Safe Auto-Revert、Fork 安全隔离 AI 自动 Review 及 AGPL-3.0 商业双授权公开合规流程。

### Modified Capabilities

<!-- 当前 openspec/specs/ 为空；既有业务能力将在 Phase 0 从 init-cat-publisher 与现状代码回补至 openspec/specs/ 后统一建档 -->

## Impact

- **仓库工程与脚手架**：新增 `.harness/` 配置与 Schema 目录、`scripts/harness/` 校验与状态机 CLI、本地 Git Hook 接入；精简重构 [AGENTS.md](AGENTS.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与 [docs/session-handoff.md](docs/session-handoff.md)，归档历史 [docs/02-design/](docs/02-design) 重叠稿与 `openspec/changes/init-cat-publisher`。
- **桌面端代码与测试结构**：逐步拆分 [apps/desktop/src/main/index.ts](apps/desktop/src/main/index.ts) 与 [apps/desktop/src/renderer/src/App.tsx](apps/desktop/src/renderer/src/App.tsx) 等超标枢纽文件；在 [apps/desktop/playwright.config.ts](apps/desktop/playwright.config.ts) 改造端口/临时目录隔离，新增 IPC 契约测试与 Electron L3 冒烟测试。
- **GitHub Actions 与远端治理**：重构 [.github/workflows/ci.yml](.github/workflows/ci.yml)，新增 `.github/risk-rules.yml`、`risk-gate.yml`、`daily-release-pr.yml`、`auto-revert.yml`、`ai-review.yml` 及 `slop-audit.yml`；调整 `leileigwl/vmark` 标签、自动删分支、分支保护与公开可见性。
- **依赖与许可合规**：新增根级 AGPL-3.0 `LICENSE` 与 `LICENSE-COMMERCIAL.md`；开发工具链按需引入轻量静态清理扫描（如 `knip`）与可选外部 `DEEPSEEK_API_KEY`（未配置时优雅降级）。
