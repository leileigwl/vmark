# CLAUDE.md：Claude Code 在 Vmark 的工作规则

@AGENTS.md

开工前先读 `AGENTS.md`（上面已导入）和 `docs/session-handoff.md`；有当日交接文档（`docs/HANDOFF-*.md`）时以最新一份为准。

## 1. 先规划，再动手（必须）

收到任务后，**先输出计划，等确认后再改代码**。计划写清：

1. **目标**：用户要的结果，一句话；不明确就先问，不猜。
2. **改哪些文件**：列出路径；碰到锁定路径（见第 4 节）就停下来问。
3. **先写哪个会失败的测试**：测试文件名、断言什么、为什么现在会失败。
4. **行数预算**：预计可评审 diff 行数。超过 600 行就先拆成多个可独立合并的 PR，写出拆分顺序。
5. **风险**：会不会影响保存、编辑、发布；需要维护者真机确认的点。

较大的功能（新平台、新面板、改契约）走 OpenSpec：`openspec/changes/<name>/` 写 proposal → design → tasks，再实现。

## 2. 写代码的顺序

1. 先写复现测试并跑一遍，**贴出失败输出**。
2. 再写修复，最小改动，不顺手重构无关代码。
3. 跑门禁，全部通过才算完成：
   - `pnpm harness:check --json`
   - `pnpm run typecheck`
   - `pnpm turbo run test`
   - `cd apps/desktop && pnpm run build && NO_PROXY=127.0.0.1,localhost npx playwright test`
   - `cd apps/desktop && pnpm run test:smoke`（数据完整性 `@smoke`，见第 3 节）
4. 禁止：`.skip` / `.only`、删断言、`as any`、空 `catch`、把 mock 测试说成真机通过。

## 3. 头号红线：不丢、不改用户内容

- 编辑器绝不能丢字、多字、多空行、改写用户格式（CRLF、空行、表格、代码块、emoji 都按原样保留）。
- 任何碰到编辑器、保存、文件读写、快捷键的改动，都必须让 `@smoke` 冒烟测试全部通过；新增行为要补 `@smoke` 用例。
- 保存走原子写入（临时文件 + rename），写失败要提示用户且原文件不变。
- 崩溃恢复备份暂不做（维护者 2026-11-24 决定），相关用例保持 `test.fail`。

## 4. 不能碰的地方（要改先问维护者）

- `.github/`、`.harness/`、`scripts/harness/`、`.agents/`、`.claude/settings.json`、`AGENTS.md`、根目录 `package.json`、`LICENSE*`
- `packages/shared/` 加字段前先问。
- 博客园图片上传 400 由维护者自己处理，不要动。

## 5. 提交与 PR

- 每个 PR 可评审 diff ≤ 600 行；确实做不到时 PR 正文第一行写 `size-exempt: <理由>`。
- 一律开 **draft**，不合并、不标 ready、不评论别人的 PR。
- 目标分支默认 `preview/latest`。
- PR 正文用中文，四段：`改了什么` / `怎么验证的`（贴命令输出，改前失败、改后通过）/ `怎么回退` / `需要维护者真机确认`。
- 界面改动在 `## 截图` 下附浅色和深色截图。
- 发布相关功能只推平台草稿箱，绝不直接发布。

## 6. 界面

- 界面质量优先：用 `ui/` 组件库，跟随应用浅色/深色主题，按钮可点区域 ≥ 36px。
- 文案用中文，简短；错误提示说清楚发生了什么、用户该做什么。

## 7. 收尾

- 每次会话结束前更新 `docs/session-handoff.md`：改了什么、PR 链接、还没做的、需要真机确认的。
- 连续两次没过同一个门禁，停下来说明情况，不要盲改。
