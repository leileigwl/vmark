# OPERATOR_PLAYBOOK.md：单窗口极简日常操作手册

本手册面向维护者（`@leileigwl`），目标是在 **Stage A 底座改造完成后（`bootstrapLocked: true`）**，仅凭 **1 个 Antigravity 窗口 + GitHub 邮件通知** 跑通高并发、低心智负担的每日快速迭代。

---

> **AI 只需要看三处**：[AGENTS.md](../AGENTS.md)（开机规则）→ 本文件（日常流程，含审核）→ [session-handoff.md](session-handoff.md)（现在做到哪）+ [TODO.md](TODO.md)（唯一任务清单）。适用于 Antigravity、OpenAI Codex、Claude Code 等任何 AI 工具，不依赖某个工具专属的命令或子代理。

## 〇、每个任务的标准流程（含审核，任何 AI 都照做）

从 [TODO.md](TODO.md) 挑任务，按下面 6 步走。

### 第 1 步：先说清楚，等「可以」
动手前用大白话告诉维护者，然后**停下等回复「可以」**再改代码：
- 要改什么（用户能看到的变化）、为什么；
- 改哪些文件（文件:行号）；
- 先写哪个失败测试、它现在为什么会失败；
- 预计改动行数（可评审 diff > 600 行先拆）；
- 风险、需要维护者真机确认的点。

### 第 2 步：失败测试 → 最小修复 → 全部门禁
1. 先写复现测试并运行，**贴出失败输出**；再写最小修复，不顺手重构。
2. 全部门禁通过才算完成，贴真实输出（写明环境：node / L2 无头 Chromium / L3 真 Electron）：
   ```bash
   pnpm harness:check --json
   pnpm run typecheck
   pnpm turbo run test
   cd apps/desktop && pnpm run build && NO_PROXY=127.0.0.1,localhost npx playwright test
   pnpm run test:smoke   # 仍在 apps/desktop 下（含 L3 真 Electron 冒烟）
   ```
3. 禁止：`.skip` / `.only`、删或放宽断言、`as any`、空 `catch`、把 mock 测试说成真 Electron 或真平台通过。同一个门禁连续失败两次，停下来报告，不要盲改。

### 第 3 步：自审（干净上下文）
**开一个新对话 / 新代理**（不带写代码时的上下文），只给它看 `git diff origin/test...HEAD`，依次按四个角度审（工具支持并行子代理就并行）：
1. **找 bug**：逻辑、边界、竞态、异步、IPC、错误处理。
2. **对照规则**：[AGENTS.md](../AGENTS.md) + 本文件（锁定路径、行数、测试诚实、模块岛、PR 格式）。
3. **内容完整性**：保存、编辑器、快捷键、关窗/退出、切换文件，会不会丢字、多字、改写用户内容。
4. **界面**：用 `ui/` 组件、浅色深色都正常、可点区域 ≥ 36px、中文文案简短且说清下一步（细则见 [UI_GUIDE.md](UI_GUIDE.md)）。

每条发现写：文件:行号、问题、触发条件或复现步骤、建议怎么改。

### 第 4 步：复核去误报
对每条发现**回到代码确认**，给置信度 0–100，**低于 80 的丢掉**，其余分级：

| 标记 | 含义 | 处理 |
|---|---|---|
| 🔴 必须改 | 合并后会出错、丢数据、泄露凭据、违反红线 | 不改不能开 PR |
| 🟡 建议改 | 小问题，不阻塞 | 顺手改，或写进 PR 正文「已知问题」 |
| 🟣 旧问题 | 本次改动之前就存在 | 不在本 PR 改，记进 [TODO.md](TODO.md) |

**一定要标 🔴 的：**
1. **用户内容被改动或丢失**：保存时改写了用户没动的行；丢字、多字、多空行；改了换行符（CRLF/LF）、表格、代码块、emoji、末尾换行；快捷键（⌘S ⌘N ⌘Z ⌘B ⌘I Tab Enter Backspace 粘贴 输入法 查找替换）导致内容变化；关窗或退出时丢掉最后的输入。
2. **写文件不原子**：直接覆盖原文件而不是临时文件 + rename；写失败没有提示或把原文件写坏。
3. **凭据泄露**：Cookie、Token、API Key 明文落盘、打进日志、传到渲染进程。
4. **测试作弊**：见第 2 步禁止项。
5. **碰了锁定路径**：`.github/`、`.harness/`、`scripts/harness/`、`.agents/`、`.claude/settings.json`、`.githooks/`、`AGENTS.md`、`LICENSE*`、根 `package.json`；未经同意改 `packages/shared/`。
6. **发布越界**：会直接公开发布而不是存草稿箱；绕过登录检测；未登录却显示成功。
7. **跨模块岛深层引用**、循环依赖、渲染进程引用 `node:fs` 或 `src/main`。
8. **改了行为却没有先失败的测试**。

**不要报**：纯格式和命名偏好；泛泛的「可以多加测试」；博客园图片上传 400（维护者自己处理）；崩溃恢复备份（已决定不做）。

### 第 5 步：有 🔴 就改完重审
改完回到第 2 步跑门禁，再用新上下文重审。**最多两轮**，还有 🔴 就停下报告。

### 第 6 步：简报 + draft PR
先给维护者一份简报：改了什么、测试结果（数字）、审核结果（🔴🟡🟣 各几条）、真机上要点哪几下。然后开 PR：
- 一律 **draft**，目标 `test`；可评审 diff ≤ 600 行（文档移动不算），否则正文第一行 `size-exempt: <理由>`。
- 正文中文四段：`改了什么` / `怎么验证的`（贴命令输出，改前失败、改后通过）/ `怎么回退` / `需要维护者真机确认`；界面改动加 `## 截图`（浅色 + 深色，改前改后）。
- PR 上 CI 还会自动跑两段式 AI Review（`.github/workflows/ai-review*.yml`：Pass 1 找 bug → Pass 2 去误报），看它的评论即可。
- 做完更新 [session-handoff.md](session-handoff.md)，并在 [TODO.md](TODO.md) 划掉该项。

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
- **唯一任务清单**：[TODO.md](TODO.md)
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
| 🔴 **红区（底座硬锁，平时连你自己都不要手动改）** | `.harness/**`、`scripts/harness/**`、`.agents/**`、`.claude/settings.json`、`.githooks/**`、`.github/**`、`AGENTS.md`、`LICENSE*`；以及命令行直推 `master`、`git push --force`、`--no-verify` | **日常开发一律禁改**。即使你本人确需升级规则/CI，也必须由前沿强模型先执行 `pnpm harness:unlock-bootstrap` 并**分两次提交推送**（第 1 个 PR 解锁修改并合入 `test`，第 2 个提交再 `pnpm harness:lock-bootstrap` 重锁；严禁把解锁与重锁塞进同一次 push 触发误熔断）。 |
| 🟡 **黄区（高风险接缝，只许强模型 + 必须 `/approve`）** | `packages/shared/src/ipcContract.ts`、`apps/desktop/src/preload/**`、`apps/desktop/src/main/index.ts`、`package.json` / `pnpm-lock.yaml` | 涉及跨端契约或依赖变更，系统会自动标为 `risk:high` 并跑齐 L0+L1+L2+L3。**务必使用前沿强模型处理**，并在 GitHub PR 页亲眼看过 Diff 后回复 `/approve` 放行。 |
| 🟢 **绿区（日常业务孤岛，高频并发随便改）** | `apps/desktop/src/main/ipc/<domain>/`、`apps/desktop/src/main/publish*.ts`、`apps/desktop/src/renderer/src/features/<domain>/`、`components/`、`editor/`、`packages/adapters/`、`packages/core/`、`docs/`、`tests/` | **主力高频迭代区**：可安全拆分互斥切片交给小模型并发实现，自动跑对应层级校验后免审并入 `test`（单文件硬上限 ≤ 500 行，禁止跨岛深层引用或 `.skip`/`as any` 绕过）。 |

### 最容易让 AI（尤其小模型）跑偏的 5 个操作习惯（请避开）
1. **在长旧窗口硬塞全新需求**：上下文塞满过时代码后，小模型最容易漏看规则或改错分支。→ **新需求一律新开窗口**（或先 `/compact`），让 `SessionStart` Hook 重新注入干净快照。
2. **用轻量小模型直接动黄区/红区文件**：修改 `ipcContract.ts`、`preload` 或架构底座时用小模型极易破坏三端契约。→ 先用 `pnpm harness:design-risk` 看风险标，标为 `high` 务必切强模型或先 `/grill-me`。
3. **不走解锁流程或手工强行改 `.harness/*.json`**：手工硬改 `ratchet.json` / `project.json` 却不同步对应锁状态或代码，会导致后续每次 CI/Hook 连锁红灯。
4. **把跨多个岛的大需求整坨丢给单个切片**：单切片 Diff 超过 300 行时，AI 注意力迅速衰减并开始产出重复代码。→ **先拆互斥切片再并发**。
5. **只看聊天区回复不看 Git Diff 与 GitHub Checks**：养成每晚看一次 `test -> master` 汇总 PR 的 5 项健康指标 + 实机测 3 分钟的习惯，零星偏航当日就能兜住。
