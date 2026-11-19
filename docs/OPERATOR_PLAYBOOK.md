# OPERATOR_PLAYBOOK.md：单窗口极简日常操作手册

本手册面向维护者（`@leileigwl`），目标是在 **Stage A 底座改造完成后（`bootstrapLocked: true`）**，仅凭 **1 个 Antigravity 窗口 + GitHub 邮件通知** 跑通高并发、低心智负担的每日快速迭代。

---

## 一、每次打开 1 个窗口怎么开始交互（3 步极简流）

无论主窗口选用强推理模型还是直接切到 **Gemini 3.8 Flash** 等轻量小模型：

1. **开窗零前戏**：新会话启动时，`.agents/hooks.json` 的 `SessionStart` 会自动向模型注入当前状态机阶段、`bootstrapLocked` 状态与待处理 GitHub 邮件单号，无需手工复述规则。
2. **只输入 1 句指令**：
   - **提新需求**：`需求：<描述要改的功能或修复的问题>`
   - **处理邮件推送问题**：`处理 Slop Issue #<编号>` 或 `检查今天汇总 PR 的合流异常`
3. **自动并发 + 物理护栏护航**：
   - 大改 UI 走完整轨（先给你确认原型再开工）；常规需求走快轨，锁契约后自动按垂直物理模块岛拆分 `ownedPaths` 并发切片在独立 Worktree 开工；
   - 原生 `PreToolUse` / `PostToolUse` / `Stop` 钩子从底层拦死越界修改、`.skip` 偷懒与假完成；同一切片连挂 2 次会自动熔断报给你，不会死循环产垃圾。

---

## 二、每天要观察的 5 个核心指标 & 只需做的 2 个动作

### 每日 5 项健康指标（每晚 21:00 CST 自动随汇总 PR 发邮件 `@leileigwl`）
1. **自动合入率**：低/中风险免人工审批直接进 `test` 的占比（健康基准 `≥ 70%`）。
2. **小模型熔断率**：触发 `retryCount >= 2` (`escalated`) 切片占比（升高时需拆细切片或切高阶模型）。
3. **合流回归与 Auto-Revert 次数**：`test` 分支自动合入后回归变红的次数（衡量跨模块接缝契约质量）。
4. **棘轮与 5 类 AI Slop 净变化**：7 大超标文件行数及全仓死代码/冗余是否持续下降。
5. **Ubuntu CI 平均耗时**：监控并行分流与路径跳过效率。

### 每日只需做 2 个朴素动作
- **动作 1（白天提需求 & 按邮件点头）**：白天尽管提需求并发干活；仅当你收到 **`risk:high 等待 /approve`** 邮件（核心底座/AST 改导出签名/安全语义）或 **Auto-Revert** 告警邮件时，才点开对应 PR 审查并在评论区回复 `/approve`（或回窗口输入单号处置）。
- **动作 2（每晚 21:00 后收汇总 PR 邮件，拉下来测 3 分钟）**：每日 21:00 系统自动执行 Drain & Freeze（冻结 `test` 入队，防冲突），开出当日 `test -> master` 汇总 PR。你看一眼 5 项指标、切到分支亲自上手试用 3 分钟，确认无误点 **Merge Commit** 合入 `master`（CI 自动同步回 `test` 并解锁明天合流）。
- **每周 Cron 邮件反推**：每周 `slop-audit` 自动创建带互斥 `<300` 行清理建议的 Issue 并 `@leileigwl`，收到邮件后在窗口回复一句 `处理 Slop Issue #<编号>` 即可并行清理。

---

## 三、全仓文件唯一归属地图（不重复写 MD）

- **规则开机引导**：[AGENTS.md](../AGENTS.md)（≤ 100 行）
- **产品与架构长期宪法**：[PRODUCT.md](PRODUCT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)
- **当前进度快照**：[session-handoff.md](session-handoff.md)（≤ 120 行覆盖写）
- **需求提案与规格契约**：`openspec/changes/<slug>/`（完结后归档至 `openspec/specs/`）
- **代码级状态机/护栏**：`.harness/*.json`、`.github/risk-rules.yml`、`scripts/harness/`
- **日常业务开发代码**：`apps/desktop/src/main/ipc/<domain>/`、`apps/desktop/src/renderer/src/features/<domain>/index.ts`、`packages/adapters/src/`

---

## 四、确需大动框架底座时的应急解锁

稳态期（`bootstrapLocked: true`）底座被物理锁死，如确需修改 CI、Harness 或跨层契约：
```bash
pnpm harness:unlock-bootstrap --reason "升级 CI 或新增核心契约能力"
# 完成并全量绿灯验收后务必重新上锁：
pnpm harness:lock-bootstrap
```
