# harness/guardrails-and-slop-governance Specification

## Purpose
建立不依赖模型自觉的代码级确定性护栏、严格垂直物理模块岛（Barrel-Only + AST 无环拓扑）、反作弊门禁、文件行数棘轮、5 类 AI Slop 熵减与 GitHub 邮件联动机制，以及可跨项目一键落地的可执行 Harness 工具包。

## Requirements

### Requirement: 代码级机械护栏优先于 Markdown 软约束（Code-First Guardrails）
系统 SHALL 将工程约束从纯文字提示词下沉为机器可读契约（`.harness/project.json`、`.harness/ratchet.json`、`.github/risk-rules.yml`）与统一校验 CLI（`pnpm harness:check`），且 [AGENTS.md](../../../../AGENTS.md) MUST 精简为不超过 100 行的纯开机引导。本地 Hook 与远端 CI MUST 运行同一套确定性代码。

#### Scenario: AGENTS.md 超过 100 行或引用失效路径
- **WHEN** 提交改动导致 `AGENTS.md` 超过 100 行，或其内部包含已不存在的文件链接或未归档的临时轮次方案
- **THEN** 统一校验命令 MUST 返回非零退出码并拒绝提交或合流

#### Scenario: 小模型上下文预算下的精简结构化报错输出
- **WHEN** 调用校验命令并传入 `--json` 参数且校验失败
- **THEN** 命令 MUST 仅输出结构化精简报错数组，每条仅包含 `file`、`line`、`rule_id` 与 `fix_hint` 四个关键字段，避免长篇堆栈日志撑爆小模型上下文窗口

### Requirement: 严格物理模块岛拆分与 AST 导入拓扑守卫（Physical Module-Islands & AST DAG）
系统 MUST 基于 TypeScript AST 静态分析强制执行垂直物理模块岛边界（`src/main/ipc/<domain>/` 与 `src/renderer/src/features/<domain>/index.ts`），确保并发功能开发通过物理文件隔离与单一公共出口（Barrel-Only）彻底消除隐性跨模块合流撞车。

#### Scenario: 跨物理模块岛绕过 Barrel 出口进行深层导入
- **WHEN** 特征岛 A 下的代码尝试直接导入特征岛 B 的内部子文件而非 B 的根目录 `index.ts` 公共导出，或引入跨岛循环依赖
- **THEN** AST 拓扑守卫 MUST 阻断提交并给出明确的导入修正路径

#### Scenario: 渲染进程越权导入主进程或 Node 私有 I/O
- **WHEN** 渲染层（`renderer`）源码新增对主进程目录（`main`）、`electron` 主进程 API 或 `node:fs`/`better-sqlite3` 的直接依赖导入
- **THEN** 依赖边界门禁 MUST 阻断提交并指引通过 `@vcat/shared` 契约与 Preload IPC 桥接

### Requirement: 反作弊测试与类型安全守卫（Anti-Reward-Hacking Gate）
系统 MUST 在每次提交前校验与 PR CI 中对变更 Diff 进行确定性反作弊扫描，防止 Agent 为追求“测试全绿”而篡改规则或掩盖缺陷。

#### Scenario: 拦截测试跳过与断言削弱作弊
- **WHEN** 某次改动在测试文件中新增 `.skip`、`.only`、`xit`、`xdescribe`，或净减少了既有测试用例的有效 `assert`/`expect` 断言数量（且无对应 OpenSpec 废弃声明）
- **THEN** 反作弊门禁 MUST 立即红灯阻断，并提示禁止以弱化或跳过测试方式通过校验

#### Scenario: 拦截未豁免的类型逃生舱与护栏自我修改
- **WHEN** 业务或测试代码新增未附带 `@harness-exempt` 书面原因与过期标签的 `as any`/`@ts-ignore`/`eslint-disable`，或非人工解锁切片尝试篡改 `.harness/`、`.agents/hooks.json`、`.github/` 与护栏脚本
- **THEN** 反作弊门禁 MUST 阻断并指出精确行列号或将风险强制升至 `risk:high`

### Requirement: 文件行数棘轮守卫（File-Size Ratchet）
系统 SHALL 强制所有新建源码文件不超过 500 行；针对既有 7 个历史超标文件（`App.tsx`、`main/index.ts`、`VditorEditor.tsx`、`vditorKeyboard.ts`、`publishHandlers.ts`、`Sidebar.tsx`、`SettingsView.tsx`），系统 MUST 在 `.harness/ratchet.json` 中固化基线行数，只允许持平或严格递减。

#### Scenario: 新建单文件超过 500 行或编辑既有巨型文件导致净增长
- **WHEN** 提交新增超过 500 行的源码文件，或修改 `.harness/ratchet.json` 受控文件导致行数高于登记基线
- **THEN** 行数棘轮门禁 MUST 失败并强制通过拆分模块来降低行数；若拆分后净行数下降，CLI SHALL 提示并单向向下更新基线

### Requirement: 5 类 AI Slop 分类与 GitHub 邮件联动三级熵减流水线
系统 SHALL 按 5 类确定性维度审计垃圾代码（1. 死代码与孤儿导出 `knip`；2. 膨胀与胶水复制；3. 类型腐化与调试残留 `console.log`/空 `catch`；4. 无断言/过度 Mock 测试腐化；5. 过期文档与未归档 Spec 熵增），并运行「PR 防新增 + 每周 Cron 自动创建通知 Issue + 专职清理切片」闭环。

#### Scenario: 每周 Cron 巡检创建结构化 Issue 并通过 @mention 邮件反推单窗口
- **WHEN** 每周定时巡检工作流在 GitHub Actions 运行结束并检出存量 Slop 债务
- **THEN** 系统 SHALL 创建或更新分类《AI Slop 周报体检》Issue，附带互斥 `<300` 行建议清理切片清单并正文 `@leileigwl` 触发 GitHub 邮件通知；维护者在单一主窗口内仅凭引用 Issue 编号即可驱动多 Agent 并发清理消化

#### Scenario: 专职 Cleanup 切片消化存量并下调棘轮
- **WHEN** Cleanup Agent 认领清理切片删除死代码或拆解超标枢纽文件且验证全部通过
- **THEN** 行数棘轮下调至新低点，清理 PR 按低/中风险通道自动合流

### Requirement: 三层文档与 OpenSpec SSOT 机械防腐
系统 MUST 严格维持三层文档分工并由 CI 自动校验一致性：宪法层（≤100 行 `AGENTS.md` + `docs/PRODUCT.md` + `docs/ARCHITECTURE.md` + 1 页式 `docs/OPERATOR_PLAYBOOK.md`）、变更契约层（`openspec/changes/` 合流后归档至 `openspec/specs/`，冗余旧设计归档至 `docs/99-archive/`）与覆盖式快照层（≤120 行 `docs/session-handoff.md`）。

#### Scenario: 文档包含死链或交接/引导文档超限膨胀
- **WHEN** CI 检查发现文档存在指向不存在仓库文件的相对路径死链，或 `AGENTS.md` 超过 100 行、`docs/session-handoff.md` 超过 120 行
- **THEN** 文档防腐门禁 MUST 红灯报错，阻断腐化文档继续合入主线

### Requirement: 可执行跨项目 Harness 工具包（Portable Executable Harness Kit）
系统 SHALL 交付可跨仓库一键复制并运行的确定性初始化脚手架（`init-project`）与机器可读 Profile 套件（含校验 Schema、工作流模板、原生 Hook 配置与可运行验证脚本），确保其他项目无需手工抄写 Markdown 即可直接开启高并发防漂移开发。

#### Scenario: 一键将可执行 Harness Kit 初始化到全新互联网后端或桌面项目
- **WHEN** 维护者在新项目根目录执行 `init-project` 并指定 `--profile web-service` 或 `--profile desktop-electron`
- **THEN** 脚手架 SHALL 自动生成对应项目画像 `.harness/project.json`、原生 `.agents/hooks.json`、确定性检查脚本、适配的 GitHub Workflows 及可运行 Profile 冒烟/压测资产，且立即通过基准健康校验
