# CLAUDE.md：Claude Code 在 Vmark 的工作规则

@AGENTS.md
@REVIEW.md

开工前先读 `AGENTS.md`、`REVIEW.md`（上面已导入）、`docs/session-handoff.md` 和 `docs/ROADMAP-AI.md`。

## 1. 工作流程（个人开发者版的「先验证、再审核、后合并」）

每个任务都走这六步，用对应的命令：

| 步骤 | 命令 | 做什么 | 谁拍板 |
|---|---|---|---|
| 1 选任务 | `/vm-next` | 从 `docs/ROADMAP-AI.md` 挑下一个 | 维护者说「做」 |
| 2 规划 | `/vm-plan <任务>` | 只读调研，输出计划，**不改代码** | 维护者说「开始」 |
| 3 实现 | `/vm-build <任务>` | 先写失败测试 → 最小修复 | — |
| 4 验证 | `/vm-verify` | 跑全部门禁，贴真实输出 | — |
| 5 审核 | `/vm-review` | 多个子代理并行审核 → 复核去误报 → 按 🔴🟡🟣 汇总 | 有 🔴 必须先改 |
| 6 交付 | `/vm-ship` → `/vm-handoff` | 开 draft PR，更新交接和路线图 | 维护者真机测后自己合并 |

维护者真机测出问题时用 `/vm-bug <描述>`，先变成可复现的任务卡再修。

审核子代理在 `.claude/agents/`：`bug-hunter`（找 bug）、`rules-auditor`（规则核对）、`test-auditor`（测试诚实）、`data-integrity-guardian`（内容不丢不改）、`ui-reviewer`（界面）、`finding-verifier`（复核去误报）。改完代码后也可以直接说「用 data-integrity-guardian 看一下」。

## 2. 规划要写清

目标、现状与根因（文件:行号）、改动清单、先写的失败测试、行数预算（>600 行先拆）、风险、需要真机确认的点、需要先回答的问题。格式见 `/vm-plan`。较大功能（新平台、改契约）走 OpenSpec：`openspec/changes/<name>/`。

## 3. 写代码的规矩

1. 先写复现测试并跑，**贴出失败输出**；再写最小修复，不顺手重构。
2. 门禁全部通过才算完成：`pnpm harness:check --json`、`pnpm run typecheck`、`pnpm turbo run test`、`apps/desktop` 下 build + `NO_PROXY=127.0.0.1,localhost npx playwright test` + `pnpm run test:smoke`。
3. 禁止：`.skip` / `.only`、删或放宽断言、`as any`、空 `catch`、把 mock 测试说成真 Electron 或真平台通过。
4. 同一个门禁连续失败两次，停下来报告，不要盲改。

## 4. 头号红线：不丢、不改用户内容

- 编辑器绝不能丢字、多字、多空行、改写用户格式；保存只写回用户改过的行。
- 打完字立刻关窗 / 退出，最后的输入必须保存（`main/editorSafety.ts`，不要删）。
- 保存走原子写入（临时文件 + rename），写失败要提示且原文件不变。
- 碰到编辑器、保存、文件读写、快捷键的改动，`@smoke` 必须全过，新行为要补 `@smoke` 用例。
- 崩溃恢复备份暂不做（维护者 2026-11-24 决定），相关用例保持 `test.fail`。

## 5. 不能碰的地方（要改先问维护者）

`.github/`、`.harness/`、`scripts/harness/`、`.agents/hooks.json`、`.claude/settings.json`、`.githooks/`、`AGENTS.md`、`LICENSE*`、根 `package.json`；`packages/shared/` 加字段先问。博客园图片上传 400 由维护者处理，不要动。

## 6. PR

- 可评审 diff ≤ 600 行，否则正文第一行 `size-exempt: <理由>`；一律 **draft**，目标 `preview/latest`；不合并、不标 ready、不评论别人的 PR。
- 正文中文四段：`改了什么` / `怎么验证的`（贴命令输出，改前失败、改后通过，写明 node / L2 / L3）/ `怎么回退` / `需要维护者真机确认`；界面改动加 `## 截图`（浅色、深色）。
- 发布功能只推平台草稿箱，绝不直接发布。

## 7. 界面

用 `ui/` 组件，跟随浅色/深色主题，可点区域 ≥ 36px，中文文案简短，错误提示说清楚用户下一步做什么。细则见 `docs/UI_GUIDE.md`。
