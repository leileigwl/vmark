# Spec Delta

## Purpose

定义多 Agent 协同研发的 Consort 风格双轨硬状态机、契约冻结前置协议、互斥路径切片所有权、大小模型路由矩阵及连续失败熔断升级契约，以消除“总合流路口”跨模块语义冲突并保障低配/小模型高并发迭代可控。

## ADDED Requirements

### Requirement: 双轨硬状态机（Dual-Track Consort State Machine）
系统 SHALL 为迭代变更提供「完整轨」与「快轨」两种确定性状态机流转路径，并 MUST 阻止跳过当前阶段前置门禁的非法状态推进。
- **完整轨（UI 大改版 / 新增交互页面）**：`SPEC -> PROTOTYPE_APPROVED -> CONTRACT_FROZEN -> FRONTEND_TDD -> BACKEND_TDD -> MERGE_GATE -> ARCHIVED`。
- **快轨（局部微调 / Bugfix / 纯后端或工具链改造）**：`SPEC -> CONTRACT_FROZEN -> SLICE_TDD -> MERGE_GATE -> ARCHIVED`。

#### Scenario: 完整轨未确认原型时尝试推进至契约冻结
- **WHEN** 某变更处于完整轨的 `SPEC` 阶段且交互原型确认记录缺失，调用状态推进接口尝试进入 `CONTRACT_FROZEN`
- **THEN** 状态机 MUST 返回非零退出码与前置缺失错误原因，并保持当前状态停留在 `SPEC`

#### Scenario: 快轨在前端局部微调场景跳过原型审批
- **WHEN** 某变更被判定为局部样式或单模块缺陷修复（符合快轨条件）且规格契约校验通过
- **THEN** 状态机 SHALL 允许直接从 `SPEC` 推进至 `CONTRACT_FROZEN`，无需阻塞于交互原型审批节点

#### Scenario: 完整轨强制执行先前端测试通过后加强后端
- **WHEN** 完整轨变更处于 `FRONTEND_TDD` 阶段且前端端到端与契约测试尚未全绿，尝试派发后端增强切片进入 `BACKEND_TDD`
- **THEN** 状态机 MUST 拒绝推进状态并提示先完成前端验收闭环

### Requirement: 契约冻结与互斥路径切片所有权（Contract-First & Disjoint Ownership）
系统 MUST 要求并发写码启动前先完成共享接口契约与跨模块集成测试骨架冻结；每个并发切片契约文件（`.harness/slices/<id>.json`）SHALL 显式声明 `owned_paths`、`forbidden_paths`、`max_diff_lines`（上限 300）、`required_tests` 与 `retry_count`，且同一批次并发切片的 `owned_paths` 交集 MUST 为空。

#### Scenario: 契约未冻结前派发并行切片
- **WHEN** 状态机尚未进入 `CONTRACT_FROZEN` 而尝试激活多个并行写码切片
- **THEN** Harness 协调器 MUST 阻断并行启动并要求先合入“契约冻结提交”

#### Scenario: 两个并发切片声明了重叠的 owned_paths
- **WHEN** 系统注册并发切片 B，而切片 B 的 `owned_paths` 模式与已激活切片 A 的 `owned_paths` 存在路径交集
- **THEN** 校验命令 MUST 报错退出并拒绝激活切片 B，防止多 Agent 在合流前写入同一文件区域

#### Scenario: 切片执行期间越界修改非授权路径或超出行数上限
- **WHEN** 切片在本地提交前或 PR 校验时修改了不在其 `owned_paths` 内（或命中 `forbidden_paths`）的文件，或有效代码 diff 超过 `max_diff_lines`（默认 300 行）
- **THEN** 校验命令 MUST 返回失败并阻断合流，要求回滚越界改动或拆分切片

### Requirement: 大小模型路由矩阵与并发隔离（Model Routing & Worktree Isolation）
系统 SHALL 依据任务风险与复杂度严格划分大 AI（高阶推理/协调模型）与小模型（低成本执行模型）的准入边界，并 MUST 为每个并发小模型分配相互隔离的工作树与运行时环境。
- **大 AI 专属阶段**：需求理解与 OpenSpec 起草、核心枢纽拆分设计、契约冻结与跨模块集成测试骨架编写、`risk:high` 核心底座开发、合流语义冲突裁决、以及小模型熔断后的接管重构。
- **小模型并发阶段**：状态机进入 `CONTRACT_FROZEN` 后，基于已冻结契约与互斥 `owned_paths` 切片卡开展低/中风险并行研发（局部 UI 组件与样式、独立适配器、单测/E2E 补齐、文档修正与 AI Slop 清理）。

#### Scenario: 仅在契约冻结后向小模型并发派发低/中风险切片
- **WHEN** 变更进入 `CONTRACT_FROZEN` 状态且所有目标切片均标记为低风险或中风险、路径互斥
- **THEN** 系统 SHALL 允许多个小模型在不同 `git worktree` 中并发开工，且各并发实例使用彼此隔离的随机测试端口与独立临时用户数据目录

#### Scenario: 拦截小模型越权认领高风险核心切片
- **WHEN** 执行身份为小模型（或低配执行器）尝试认领涉及核心引擎、鉴权协议、IPC 主进程安全边界或工作流配置文件的高风险切片
- **THEN** 路由守卫 MUST 拒绝派发并要求路由至大 AI 处理

### Requirement: 连续失败自动熔断与升级机制（Circuit Breaker & Escalation）
系统 MUST 对小模型执行切片设置连续失败计数；当同一切片连续 2 次未能通过机械校验门禁时，系统 SHALL 立即触发熔断并升级至大 AI。

#### Scenario: 同一切片连续两次未通过门禁校验
- **WHEN** 小模型对同一切片连续第 2 次触发门禁失败（如反作弊阻断、类型检查失败或必跑测试红灯），`retry_count` 达到阈值 2
- **THEN** 系统 MUST 自动将切片状态置为 `status: "escalated"`，锁定并阻断小模型发起第 3 次盲改，同时生成包含失败摘要与 diff 上下文的升级上下文交由大 AI 接管或重新拆细切片
