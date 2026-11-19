# Spec Delta

## Purpose

建立不依赖模型自觉的代码级确定性护栏、反作弊测试门禁、历史巨型文件行数棘轮、5 类 AI 垃圾代码（Slop）三级熵减流水线及三层文档 SSOT 机械防腐体系，确保在切换至低配或小模型时仍保持架构纯洁度与高质量交付。

## ADDED Requirements

### Requirement: 代码级机械护栏优先于 Markdown 软约束（Code-First Guardrails）
系统 SHALL 将工程约束从纯文字提示词下沉为机器可读契约（`.harness/project.json`、`.harness/ratchet.json`、`.github/risk-rules.yml`）与统一校验命令行工具（`pnpm harness:check`），且 [AGENTS.md](AGENTS.md) MUST 精简为不超过 100 行的纯开机引导索引。本地 Git Hook 与远端 CI MUST 运行同一套确定性校验逻辑。

#### Scenario: AGENTS.md 超过 100 行或引用失效路径
- **WHEN** 提交改动导致 `AGENTS.md` 超过 100 行，或其内部包含已不存在的文件链接或未归档的临时轮次方案
- **THEN** 统一校验命令 MUST 返回非零退出码并拒绝提交或合流

#### Scenario: 小模型上下文预算下的精简结构化报错输出
- **WHEN** 调用校验命令并传入 `--json` 参数且校验失败
- **THEN** 命令 MUST 仅输出结构化精简报错数组，每条仅包含 `file`、`line`、`rule_id` 与 `fix_hint` 四个关键字段，避免长篇堆栈日志撑爆小模型上下文窗口

### Requirement: 反作弊测试与类型安全守卫（Anti-Reward-Hacking Gate）
系统 MUST 在每次提交前校验与 PR CI 中对变更 Diff 进行确定性反作弊扫描，防止 Agent 为追求“测试全绿”而篡改规则或掩盖缺陷。

#### Scenario: 拦截测试跳过与断言削弱作弊
- **WHEN** 某次改动在测试文件中新增 `.skip`、`.only`、`xit`、`xdescribe`，或净减少了既有测试用例的有效 `assert`/`expect` 断言数量（且无对应 OpenSpec 废弃声明）
- **THEN** 反作弊门禁 MUST 立即红灯阻断，并提示禁止以弱化或跳过测试方式通过校验

#### Scenario: 拦截未豁免的类型逃生舱
- **WHEN** 业务或测试代码 Diff 中新增未附带 `@harness-exempt` 书面原因与过期标签的 `as any`、`@ts-ignore`、`@ts-nocheck` 或 `eslint-disable`
- **THEN** 反作弊门禁 MUST 阻断合并并指出精确行列号

#### Scenario: 拦截低风险身份自我修改护栏或降级规则
- **WHEN** 非高风险人工审批通道下的切片尝试修改 `.harness/**`、`.github/workflows/**`、`.github/risk-rules.yml` 或本地护栏校验脚本
- **THEN** 门禁 MUST 判定为越权修改并将风险强制升至 `risk:high` 或直接阻断，严禁 Agent 自行放宽约束

### Requirement: 文件行数棘轮与单向依赖边界守卫（File-Size Ratchet & Boundary Lint）
系统 SHALL 强制所有新建源码文件不超过 500 行；针对既有 7 个历史超标文件（`App.tsx`、`main/index.ts`、`VditorEditor.tsx`、`vditorKeyboard.ts`、`publishHandlers.ts`、`Sidebar.tsx`、`SettingsView.tsx`），系统 MUST 在 `.harness/ratchet.json` 中固化当前物理行数基线，只允许保持持平或严格递减，并 MUST 强制禁止渲染层直接越权引入主进程或 Node 私有系统模块。

#### Scenario: 新建单文件超过 500 行上限
- **WHEN** 提交新增了超过 500 行的源码文件（测试数据夹具除外）
- **THEN** 架构守卫 MUST 红灯阻断并提示按领域职责拆分模块

#### Scenario: 修改历史巨型枢纽文件导致净行数膨胀
- **WHEN** 某次改动编辑了 `.harness/ratchet.json` 中登记的受控文件（如 `App.tsx` 当前基线 1393 行或 `main/index.ts` 当前基线 1303 行），导致保存后行数高于登记基线
- **THEN** 行数棘轮门禁 MUST 失败并强制要求通过重构拆出子模块以净减少行数；若文件行数净下降，CLI SHALL 提示并支持单向向下更新棘轮基线

#### Scenario: 渲染进程越权导入主进程或 Node 私有 I/O
- **WHEN** `apps/desktop/src/renderer/` 下文件新增对 `apps/desktop/src/main/`、`electron` 主进程 API 或 `node:fs`/`better-sqlite3` 的直接依赖导入
- **THEN** 依赖边界门禁 MUST 阻断提交并指引通过 `@vcat/shared` 契约与 Preload IPC 桥接

### Requirement: 5 类 AI Slop 分类与三级熵减流水线（OpenAI 20% Cleanup）
系统 SHALL 将高频 AI 迭代产生的垃圾代码（AI Slop）精确划分为 5 类可机械审计维度，并 MUST 运行「PR 防新增 + 每周 Cron 自动分类体检 + 专职小切片消化清理」的三级熵减闭环：
1. **死代码与孤儿资产**：未被引用的文件、导出符号、失效依赖（基于 `knip` 扫描）及已合并未清理废弃分支；
2. **膨胀与胶水复制**：超行枢纽文件与跨模块重复复制粘贴代码块；
3. **类型腐化与调试残留**：绕过类型检查注释、空 `catch {}` 吞错、遗留调试 `console.log`；
4. **测试腐化**：无有效断言的空壳测试、与真实实现脱节的过度 Mock、重复测试夹具；
5. **文档与 Spec 熵增**：长期停留在 `in-progress` 未归档的变更目录、彼此重叠的设计稿、文档死链与过期轮次记录。

#### Scenario: 每周定时自动巡检并产出分类《Slop 体检报告》
- **WHEN** 每周定时巡检工作流触发（或手动触发 `slop-audit`）
- **THEN** 系统 SHALL 对全仓运行 5 类静态扫描并输出机器可解析及人类可读的分类体检报告 Issue，按影响面生成若干 `<300` 行且路径互斥的清理切片建议

#### Scenario: 专职 Cleanup 切片消化存量与历史枢纽文件拆解
- **WHEN** Cleanup Agent 认领清理切片并删除死代码或把超标枢纽文件拆解为注册表/Hook 子模块且全部验证测试通过
- **THEN** 行数棘轮下调至新低点，清理 PR 按风险分级进入快速合流通道

### Requirement: 三层文档与 OpenSpec SSOT 机械防腐
系统 MUST 严格强制三层文档分工并由 CI 校验一致性：
- **宪法层（稳定事实来源）**：[AGENTS.md](AGENTS.md)（≤100 行）、[docs/PRODUCT.md](docs/PRODUCT.md)（产品边界）与 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（系统架构）。
- **变更契约层（过程态）**：一切需求与架构重构 MUST 先在 `openspec/changes/<slug>/` 立项，合流后强制归档并同步能力规格至 `openspec/specs/`；历史重叠设计稿统一归档至 `docs/99-archive/`。
- **机器状态层（覆盖式快照）**：[docs/session-handoff.md](docs/session-handoff.md) SHALL 采用固定节结构覆盖更新（总行数严格受限），严禁无限追加过时轮次流水账。

#### Scenario: 文档包含死链或交接文档超限膨胀
- **WHEN** CI 检查发现 `docs/`、`AGENTS.md` 或 `openspec/` 中存在指向不存在仓库文件的相对链接，或 `docs/session-handoff.md` 超过约定上限行数
- **THEN** 文档防腐门禁 MUST 红灯报错，阻断过时或腐化文档继续合入主线
