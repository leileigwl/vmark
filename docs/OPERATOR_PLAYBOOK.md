# OPERATOR_PLAYBOOK.md：单窗口极简日常操作手册

本手册面向维护者（`@leileigwl`），目标是在 **Stage A 底座改造完成后（`bootstrapLocked: true`）**，仅凭 **1 个 Antigravity 窗口 + GitHub 邮件通知** 跑通高并发、低心智负担的每日快速迭代。

---

## 一、窗口怎么开、指令在哪输、过程在哪看（开箱必读）

### 1. 旧对话继续 vs 新开窗口（配合 `/compact`）
- **同一需求的连续追问 / 修同一个报错**：留在**当前旧窗口**继续说，保留局部上下文。
- **每开启一个新需求、处理新的邮件 Issue，或当前对话已经跑了多轮偏长**：**直接新开一个窗口**（或先用 `/compact` 压缩后再继续）。
  - 原因：新窗口启动时 `.agents/hooks.json` 的 `SessionStart` 会自动注入当前状态机阶段、[session-handoff.md](session-handoff.md)、激活切片及待处理 GitHub 邮件单号；即使切到 **Gemini 3.8 Flash** 等轻量小模型，新窗口也不会被无关历史聊天撑爆注意力或带偏。

### 2. 前期构思阶段即打标（Shift-Left Risk + Superpowers 思路）
- 风险判定**不是等写完代码才做**：从新项目或新需求梳理一开始（配合 `/grill-me` / `/openspec` 构思方案与架构时），就执行：
  ```bash
  pnpm harness:design-risk --paths "目标模块路径1,目标模块路径2" --json
  ```
- 直接为方案里每个模块提前打上 `[risk:low]` / `[risk:mid]` / `[risk:high]` 与 `L0–L3` 验收标签——高风险底座/跨端契约交前沿强模型并在 PR 走 `/approve`，中/低风险孤岛交付小模型并发快跑。

### 3. 在哪里输入指令 & 在哪里查看全部执行与改动过程
- **指令输入入口（仅 2 处）**：
  1. **Antigravity 聊天输入框**：日常自然语言需求、处理单号，及常用斜杠指令（`/grill-me` 梳理设计、`/goal` 长程闭环、`/compact` 压缩上下文、`/opsx-propose` 建提案）。
  2. **GitHub PR 评论框**：仅收到 `risk:high 等待 /approve` 邮件后，点开 PR 审查 Diff 并回复 `/approve` 放行合并。
- **过程与改动观测位置（4 处一眼看清）**：
  1. **对话流工具卡片与可点击链接**：Antigravity 回复区里的每次 `run_command` / `edit_file` / `write_file` / Subagent 调用折叠卡片，以及带 `[文件名](file://...)` 行号的总结链接。
  2. **IDE 左侧 Source Control（Git Diff）或终端**：`git status` / `git diff` 逐行审阅未提交与已提交改动。
  3. **机器状态快照**：实时查看 [`.harness/state.json`](../.harness/state.json)（当前阶段 `phase` 与门禁开关）及 `.harness/slices/*.json`（每个并行切片的 `ownedPaths`、`predictedRisk` 与 `retryCount`）。
  4. **GitHub 页面与邮件推送**：PR 的 **Checks / Actions** 标签页（L0–L3 每一步绿/红灯与日志）、每晚 21:00 CST `test -> master` **汇总 PR 5 大健康仪表盘**，以及每周自动创建的 `slop:cleanup` Issue。

---

## 二、日常交互 3 步极简流

无论主窗口选用强推理模型还是直接切到 **Gemini 3.8 Flash** 等轻量小模型：

1. **开窗零前戏**：新会话启动时，`SessionStart` Hook 自动呈报当前阶段、`bootstrapLocked` 状态与待处理 GitHub 邮件单号，无需手工复述规则。
2. **只输入 1 句指令**：
   - **提新需求（含并发拆分）**：`需求：<描述要改的功能或修复的问题>`
   - **处理邮件推送问题**：`处理 Slop Issue #<编号>` 或 `检查今天汇总 PR 的合流异常`
3. **自动并发 + 物理护栏护航**：
   - 构思与 `design-risk` 打标 → 锁共享契约（`CONTRACT_FROZEN`）→ `pnpm harness:plan-slices` 按垂直物理模块岛生成互斥 `ownedPaths` 切片并派发独立 Worktree 并发开发；
   - 原生 `PreToolUse` / `PostToolUse` / `Stop` 钩子物理拦截越界修改、`.skip` 偷懒与假完成；同一切片连挂 2 次自动置 `escalated` 熔断交还接管。

---

## 三、每天要观察的 5 个核心指标 & 只需做的 2 个动作

### 每日 5 项健康指标（每晚 21:00 CST 自动随汇总 PR 发邮件 `@leileigwl`）
1. **自动合入率**：低/中风险免人工审批直接进 `test` 的占比（健康基准 `≥ 70%`）。
2. **小模型熔断率**：触发 `retryCount >= 2` (`escalated`) 切片占比（升高时需拆细切片或切高阶模型）。
3. **合流回归与 Auto-Revert 次数**：`test` 分支自动合入后回归变红的次数（衡量跨模块接缝契约质量）。
4. **棘轮与 5 类 AI Slop 净变化**：7 大超标文件行数及全仓死代码/冗余是否持续下降。
5. **Ubuntu CI 平均耗时**：监控并行分流与路径跳过效率。

### 每日只需做 2 个朴素动作
- **动作 1（白天提需求 & 按邮件点头）**：白天尽管提需求并发干活；仅收到 **`risk:high 等待 /approve`** 或 **Auto-Revert** 告警邮件时，点开对应 PR 审查并回复 `/approve`（或回新窗口输入单号处置）。
- **动作 2（每晚 21:00 后收汇总 PR 邮件，拉下来测 3 分钟）**：每日 21:00 系统自动执行 Drain & Freeze（冻结 `test` 入队，防冲突），开出当日 `test -> master` 汇总 PR。看一眼 5 项指标、切至 `test` 实机上手体验 3 分钟；确认无误点 **Merge Commit** 合入 `master`（CI 自动同步回 `test` 并解锁明天合流）。
- **每周 Cron 邮件反推**：每周 `slop-audit` 自动创建带互斥 `<300` 行清理建议的 Issue 并 `@leileigwl`，收到邮件后开新窗口输入 `处理 Slop Issue #<编号>` 即可并行清理。

---

## 四、全仓文件唯一归属 & Skill 独立打包

- **规则开机引导**：[AGENTS.md](../AGENTS.md)（≤ 100 行）
- **产品与架构长期宪法**：[PRODUCT.md](PRODUCT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)
- **当前进度快照**：[session-handoff.md](session-handoff.md)（≤ 120 行覆盖写）
- **Superpowers Harness Skill**：[SKILL.md](../.agents/skills/superpowers-harness/SKILL.md)
- **代码级状态机/护栏**：`.harness/*.json`、`.github/risk-rules.yml`、`scripts/harness/`
- **日常业务开发代码**：`apps/desktop/src/main/ipc/<domain>/`、`apps/desktop/src/renderer/src/features/<domain>/index.ts`、`packages/adapters/src/`

### 应急解锁底座 & 导出独立公开 Skill 仓库
```bash
# 确需修改 CI/Harness/共享骨架时，先显式解锁（完成后务必重锁）：
pnpm harness:unlock-bootstrap --reason "升级 CI 或新增核心契约能力"
pnpm harness:lock-bootstrap

# 等全流程实测满意后，一键导出独立可发布的公开 Skill 仓库（含 publish-to-github.sh）：
pnpm harness:export-skill --out dist/superpowers-harness-skill
```

---

## 五、红黄绿三色边界：哪些连你自己平时都不要直接改 & 防 AI 跑偏清单

为了保证长期高速迭代不退化、小模型（如 3.8 Flash）绝不改坏底座，全仓严格按以下三色边界执行：

| 级别 | 范围与动作 | 你和小模型平时能怎么动 |
| :--- | :--- | :--- |
| 🔴 **红区（底座硬锁，平时连你自己都不要手动改）** | `.harness/**`、`scripts/harness/**`、`.agents/hooks.json`、`.claude/settings.json`、`.githooks/**`、`.github/**`、`AGENTS.md`、`LICENSE*`；以及命令行直推 `master`、`git push --force`、`--no-verify` | **日常开发一律禁改**。即使你本人确需升级规则/CI，也必须由前沿强模型先执行 `pnpm harness:unlock-bootstrap` 并**分两次提交推送**（第 1 个 PR 解锁修改并合入 `test`，第 2 个提交再 `pnpm harness:lock-bootstrap` 重锁；严禁把解锁与重锁塞进同一次 push 触发误熔断）。 |
| 🟡 **黄区（高风险接缝，只许强模型 + 必须 `/approve`）** | `packages/shared/src/ipcContract.ts`、`apps/desktop/src/preload/**`、`apps/desktop/src/main/index.ts`、`package.json` / `pnpm-lock.yaml` | 涉及跨端契约或依赖变更，系统会自动标为 `risk:high` 并跑齐 L0+L1+L2+L3。**务必使用前沿强模型处理**，并在 GitHub PR 页亲眼看过 Diff 后回复 `/approve` 放行。 |
| 🟢 **绿区（日常业务孤岛，高频并发随便改）** | `apps/desktop/src/main/ipc/<domain>/`、`apps/desktop/src/main/publish*.ts`、`apps/desktop/src/renderer/src/features/<domain>/`、`components/`、`editor/`、`packages/adapters/`、`packages/core/`、`docs/`、`tests/` | **主力高频迭代区**：可安全拆分互斥切片交给小模型并发实现，自动跑对应层级校验后免审并入 `test`（单文件硬上限 ≤ 500 行，禁止跨岛深层引用或 `.skip`/`as any` 绕过）。 |

### 最容易让 AI（尤其小模型）跑偏的 5 个操作习惯（请避开）
1. **在长旧窗口硬塞全新需求**：上下文塞满过时代码后，小模型最容易漏看规则或改错分支。→ **新需求一律新开窗口**（或先 `/compact`），让 `SessionStart` Hook 重新注入干净快照。
2. **用轻量小模型直接动黄区/红区文件**：修改 `ipcContract.ts`、`preload` 或架构底座时用小模型极易破坏三端契约。→ 先用 `pnpm harness:design-risk` 看风险标，标为 `high` 务必切强模型或先 `/grill-me`。
3. **不走解锁流程或手工强行改 `.harness/*.json`**：手工硬改 `ratchet.json` / `project.json` 却不同步对应锁状态或代码，会导致后续每次 CI/Hook 连锁红灯。
4. **把跨多个岛的大需求整坨丢给单个切片**：单切片 Diff 超过 300 行时，AI 注意力迅速衰减并开始产出重复代码。→ **先拆互斥切片再并发**。
5. **只看聊天区回复不看 Git Diff 与 GitHub Checks**：养成每晚看一次 `test -> master` 汇总 PR 的 5 项健康指标 + 实机测 3 分钟的习惯，零星偏航当日就能兜住。
