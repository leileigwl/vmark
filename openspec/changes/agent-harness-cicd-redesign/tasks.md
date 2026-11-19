# Tasks

## 1. Phase 0：公开合规前哨与历史文档/OpenSpec 清理

- [ ] 1.1 执行全 Git 历史敏感信息与隐私路径扫描（覆盖 API Key、平台 Cookie/Token 如 `BDUSS`/`SESSDATA` 及本地硬编码路径），确认零泄露或完成历史清理后生成扫描通过报告并验证工作区测试全绿
- [ ] 1.2 在仓库根目录新增 `LICENSE`（GNU AGPL-3.0-only 官方全文）与 `LICENSE-COMMERCIAL.md`（商业付费双授权说明），更新 `package.json` 的 `license` 字段为 `SEE LICENSE IN LICENSE`，并验证 `openspec` 与许可证声明一致
- [ ] 1.3 完成敏感历史扫描与双授权落盘且经维护者最终确认后，通过 `gh repo edit leileigwl/vmark --visibility public --accept-visibility-change-consequences` 切换仓库为公开可见并校验 `gh repo view --json visibility` 返回 `PUBLIC`
- [ ] 1.4 重构 [AGENTS.md](AGENTS.md) 瘦身为 ≤100 行纯开机入口（移除过期 Round 27 临时方案），同步整理 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与覆盖式快照 [docs/session-handoff.md](docs/session-handoff.md)（≤120 行），并将 `docs/02-design/` 重叠过期设计稿归档至 `docs/99-archive/`，验证所有 Markdown 相对路径无死链
- [ ] 1.5 核对并补齐 `openspec/changes/init-cat-publisher` 已落地能力规格，执行 `openspec archive init-cat-publisher` 完成归档与 `openspec/specs/` 回填，运行 `openspec list --specs` 与 `openspec validate --all` 验证 0 错误

## 2. Phase 1：代码级确定性 Harness 引擎与本地硬护栏

- [ ] 2.1 创建 `.harness/schemas/` 下 `project.schema.json`、`state.schema.json`、`slice.schema.json`、`ratchet.schema.json` 与仓库实例配置 `.harness/project.json`、`.harness/ratchet.json`、`.harness/state.json`，验证 JSON Schema 校验脚本通过
- [ ] 2.2 实现 `scripts/harness/anti-cheat.ts` 与 `scripts/harness/ratchet.ts`：覆盖反作弊 Diff 扫描（禁止 `.skip`/`.only`/断言净减少/未豁免 `as any`/`@ts-ignore`/`eslint-disable`/低风险修改护栏文件）、新文件 ≤500 行限制、7 个超标历史文件行数棘轮基线及 `renderer` 跨层引入禁令，并编写对应单元测试验证全部红绿场景通过
- [ ] 2.3 实现 `scripts/harness/slice-lock.ts` 与状态机 CLI（`scripts/harness/cli.ts`，挂载至根 `package.json` 的 `pnpm harness:check`、`pnpm harness:transition`、`pnpm harness:slice-verify`），支持 `--json` 精简四元组报错输出、并发切片 `ownedPaths` 互斥校验、单切片 `<300` 行校验及连续 2 次失败自动置 `status: "escalated"` 熔断，并编写端到端 CLI 单测验证通过
- [ ] 2.4 接入本地 Git Hooks（`pre-commit` 与 `pre-push` 调用 `pnpm harness:check --json`）并在 [AGENTS.md](AGENTS.md) 写明大小模型路由矩阵与命令调用规范，通过模拟违例分支提交测试 Hook 拦截生效

## 3. Phase 2：GitHub 仓库治理、风险分级自动合并与安全 AI Review CI/CD

- [ ] 3.1 通过 `gh` CLI 在 `leileigwl/vmark` 配置标签体系（`risk:low`、`risk:mid`、`risk:high`、`slop:cleanup`、`freeze:release-window`、`circuit:paused`），开启 `delete_branch_on_merge` 与 `allow_auto_merge`，设置 `master`/`test` 分支保护并校验 API 返回符合预期
- [ ] 3.2 创建 `.github/risk-rules.yml` 风险分级唯一配置源与解析测试，重构 [.github/workflows/ci.yml](.github/workflows/ci.yml) 为 `ubuntu-latest` 并行矩阵（拆分 L0 门禁、L1 单测+IPC 契约、L2 Playwright 并行，纯文档改动自动跳过 E2E），通过触发测试 PR 验证 `macos-latest` 不再在日常 PR 启动且跑通全绿
- [ ] 3.3 实现 `.github/workflows/risk-gate.yml`：校验证信任来源、`concurrency: merge-test` 串行合流、合前同步 `test`、冻结锁退避、`risk:low`/`risk:mid` 自动 Squash 合入 `test`、`risk:high` 等待 `leileigwl` `/approve` 指令才放行，并通过模拟低/高风险内部 PR 与外部 Fork PR 验证行为完全符合 Spec
- [ ] 3.4 实现 `.github/workflows/daily-release-pr.yml`（每日 21:00 CST 与手动触发 Drain & Freeze，生成零冲突 `test -> master` 汇总 PR，Merge Commit 合入后同步回 `test` 并解锁）与 `.github/workflows/auto-revert.yml`（`test` 回归变红打熔断标记并生成唯一 1 个 Revert PR），用测试分支演练合并后同步与防雪崩回滚成功
- [ ] 3.5 实现 Fork 安全隔离两段式 `.github/workflows/ai-review.yml`（无密钥 `pull_request` 生成 diff Artifact + 受控 `workflow_run` 仅读 diff 调 DeepSeek/OpenAI API，仅允许单向调高风险且未配密钥时优雅降级）及外部 Fork PR CLA/DCO 与 `.github/PULL_REQUEST_TEMPLATE.md` 检查，验证 Fork PR 流程零密钥暴露且降级运行正常

## 4. Phase 3：五层测试金字塔升级与枢纽文件去冲突解耦

- [ ] 4.1 建立 `packages/shared/src/ipcContract.ts` 与 `apps/desktop/tests/ipcContract.test.ts`，自动校验 `main`、`preload`（`apps/desktop/src/preload/index.ts`）与 `ElectronAPI` 三端频道名称及签名一致性，确保 L1 执行耗时 `<10s` 且故意制造不匹配时红灯拦截
- [ ] 4.2 改造 [apps/desktop/playwright.config.ts](apps/desktop/playwright.config.ts) 支持空闲随机端口分配与独立临时目录，允许多个 `git worktree` 并发执行 `playwright test` 零冲突全绿
- [ ] 4.3 新增 L3 真实 Electron 冒烟测试（`apps/desktop/tests/electron-smoke.spec.ts` + `package.json` `test:electron-smoke`）并在 `ubuntu-latest` CI 上接入 `xvfb-run`，验证真实打包后主进程窗口无白屏崩溃、SQLite 读写与基础 IPC 往返全绿
- [ ] 4.4 按领域拆解 `apps/desktop/src/main/index.ts`（拆出 `src/main/ipc/registry.ts` 及工作区/文章/图床/平台鉴权子域模块与对应单测），将 `main/index.ts` 降至 500 行以下并下调 `.harness/ratchet.json` 基线，验证全量测试通过
- [ ] 4.5 按领域拆解 `apps/desktop/src/renderer/src/App.tsx`（拆出 `src/renderer/src/features/` 领域 Hooks 与壳组件），将 `App.tsx` 降至 500 行以下并下调 `.harness/ratchet.json` 基线，验证 `typecheck`、单测与全部 Playwright E2E 通过

## 5. Phase 4：20% AI Slop 定期熵减流水线与跨项目后端压测规范沉淀

- [ ] 5.1 引入 `knip` 并实现 `scripts/harness/slop.ts`（完整审计 5 类 AI Slop 与 `.harness` 过期豁免）及 `.github/workflows/slop-audit.yml`（每周定时扫描并生成结构化《Slop 体检报告》Issue 与待拆解清理切片），本地运行确认产出有效分类账本
- [ ] 5.2 将通用 `.harness/schemas/`、`scripts/harness/` 及 `.github/workflows/` 抽离整理至 `.harness/templates/` 可复用标准包，并落地 `web-service` 后端标准规范与示例模板（覆盖容器 DB/Redis 集成、Migration `up -> seed -> down -> up`、Staging 冒烟探针与 `k6` 基准压测阈值脚本），验证可基于模板一键初始化新项目配置并跑通校验

## Workflow follow-up

- 本提案全部 Phase 实施验收后，运行 `openspec archive agent-harness-cicd-redesign` 将 4 项新增能力规范同步并归档至 `openspec/specs/`。
- 通过 `openspec validate --all` 验证 `openspec/specs/` 与 `.harness/` 状态一致。
