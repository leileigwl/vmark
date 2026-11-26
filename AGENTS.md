# AGENTS.md：Vmark AI 编程助手开机引导

> 本文件仅保留稳定开机规则（硬上限 **≤ 100 行**）。具体机械约束由 `.harness/` 与 `scripts/harness/` 强制执行，原生钩子见 `.agents/hooks.json`。

## 1. 单一事实来源（SSOT）索引

1. **产品边界与 Non-Goals**：[`docs/PRODUCT.md`](docs/PRODUCT.md)
2. **技术架构与模块岛规范**：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
3. **单窗口极简日常操作**：[`docs/OPERATOR_PLAYBOOK.md`](docs/OPERATOR_PLAYBOOK.md)
4. **当前进度快照（覆盖写）**：[`docs/session-handoff.md`](docs/session-handoff.md)
5. **发版（tag / 打包 / 回滚）**：[`docs/RELEASE.md`](docs/RELEASE.md)。AI 不手动打正式版 tag、不改 Release；版本号由合并 master 后的 `release-plan.mjs` 自动算
6. **变更需求与规格契约**：`openspec/specs/`（已落地基线）与 `openspec/changes/`（进行中变更）

## 2. 机械门禁与核心命令（必须遵守，不靠自觉）

- **包管理器唯一**：全仓仅使用 `pnpm`，严禁 `npm` / `yarn` 混用。
- **开局与收尾校验**：
  - 全量静态门禁：`pnpm harness:check --json`（含反作弊、文件行数棘轮、物理模块岛 AST DAG、文档死链）
  - 类型与单测：`pnpm run typecheck` / `pnpm turbo run test`
  - 状态机推进：`pnpm harness:transition --to <PHASE>`
  - 并发切片规划与校验：`pnpm harness:plan-slices` / `pnpm harness:slice-verify --slice <id>`
- **精简 JSON 错误适配**：遇到阻塞时优先执行 `pnpm harness:check --json` 获取 `{file, line, rule_id, fix_hint}`，禁止猜改。

## 3. 两阶段底座锁定与大小模型分工

- **两阶段锁（`.harness/project.json` -> `bootstrapLocked`）**：
  - `true` 时底座硬锁定（`.harness/`、`scripts/harness/`、`.agents/`、`.github/`、`packages/shared/`、`LICENSE*`），日常迭代**严禁顺手改框架**；确需升级框架须由人类维护者先执行 `pnpm harness:unlock-bootstrap`。
- **大小模型分工与并发准则**：
  - **高阶/统筹阶段**（仅大 AI 或显式审批）：需求与 OpenSpec 设计、契约冻结、枢纽模块重构、`risk:high` 核心改动、2 次失败熔断接管。
  - **小模型并发阶段**（含 Gemini 3.8 Flash）：仅在契约冻结（`CONTRACT_FROZEN`）后认领互不重叠 `ownedPaths` 切片（`<300` 行，独立 Worktree），连续 2 次未过门禁即触发 `escalated` 熔断停止盲改。

## 4. 不可逾越的安全与交付红线

1. **默认仅推平台草稿箱**，保留创作者人工确认；严禁私自修改合规与错峰边界。
2. **凭据零外泄**：Cookie / API Key 仅限主进程 `safeStorage` 落库，日志与渲染进程零回显。
3. **测试诚实原则**：严禁擅自 `.skip`/删断言/`as any`；绝不可把 Mock 测试冒充为 L3 真 Electron 或 L4 真实平台联调通过。
4. **文件与模块岛红线**：新建文件 **≤ 500 行**，既有 7 大超标文件严格遵循 `.harness/ratchet.json` 只减不增；跨特征岛仅允许经 `index.ts` Barrel 导出引用，禁止跨岛深层导入与循环依赖。
