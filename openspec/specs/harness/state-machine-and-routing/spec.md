# harness/state-machine-and-routing Specification

## Purpose
定义多 Agent 协同研发的双轨硬状态机、主控小模型兼容的原生生命周期钩子硬锁、两阶段底座锁定、契约冻结与互斥路径切片规划、并发隔离与连续失败熔断契约，确保即使主窗口直跑 Gemini 3.8 Flash 等小模型亦能高速并发不跑偏。

## Requirements

### Requirement: 双轨硬状态机（Dual-Track Consort State Machine）
系统 SHALL 为迭代变更提供「完整轨」（`SPEC -> PROTOTYPE_APPROVED -> CONTRACT_FROZEN -> FRONTEND_TDD -> BACKEND_TDD -> MERGE_GATE -> ARCHIVED`）与「快轨」（`SPEC -> CONTRACT_FROZEN -> SLICE_TDD -> MERGE_GATE -> ARCHIVED`）两种确定性状态机流转路径，并 MUST 阻止跳过当前阶段前置门禁的非法状态推进。

#### Scenario: 完整轨未确认原型时尝试推进至契约冻结
- **WHEN** 某变更处于完整轨的 `SPEC` 阶段且交互原型确认记录缺失，调用状态推进接口尝试进入 `CONTRACT_FROZEN`
- **THEN** 状态机 MUST 返回非零退出码与前置缺失错误原因，并保持当前状态停留在 `SPEC`

#### Scenario: 快轨在前端局部微调场景跳过原型审批
- **WHEN** 某变更被判定为局部样式或单模块缺陷修复（符合快轨条件）且规格契约校验通过
- **THEN** 状态机 SHALL 允许直接从 `SPEC` 推进至 `CONTRACT_FROZEN`，无需阻塞于交互原型审批节点

#### Scenario: 完整轨强制执行先前端测试通过后加强后端
- **WHEN** 完整轨变更处于 `FRONTEND_TDD` 阶段且前端端到端与契约测试尚未全绿，尝试派发后端增强切片进入 `BACKEND_TDD`
- **THEN** 状态机 MUST 拒绝推进状态并提示先完成前端验收闭环

### Requirement: 主控小模型兼容与原生生命周期钩子（Small-Model Orchestrator & Native Hooks）
系统 SHALL 通过宿主 Agent 原生生命周期钩子（`SessionStart`、`PreToolUse`、`PostToolUse`、`Stop`）强制接管运行边界，与 Git Hook 共享同一确定性适配器，保证即便主控窗口直接运行 Gemini 3.8 Flash 等小模型也不会因上下文遗忘而跑偏或“假完成”。

#### Scenario: 新开窗口触发 SessionStart 自动注入精简态势
- **WHEN** 用户新建或打开主交互窗口（无论选用何种模型）启动会话
- **THEN** `SessionStart` 钩子 SHALL 自动注入当前状态机阶段、底座锁定标志、待处理 GitHub 汇总/告警条目及标准入口命令，使模型开局即进入正确轨道

#### Scenario: PreToolUse 在工具执行前物理拦截越界写码与危险命令
- **WHEN** 运行中小模型尝试调用文件编辑或命令执行工具，在契约未冻结前写入业务实现、修改所属切片 `ownedPaths` 之外的文件、或运行绕过 `pnpm`/强推主分支命令
- **THEN** `PreToolUse` 钩子 MUST 返回阻断裁决（`deny`）并在工具落地前硬拒绝该操作

#### Scenario: PostToolUse 即时反馈微粒违规与 Stop 拦截假完成
- **WHEN** 模型每次落盘源码后 `PostToolUse` 立即发现行数棘轮或反作弊违规，或模型未通过全部必跑机械检查即企图结束回复
- **THEN** `PostToolUse` SHALL 将违规信息写入精简错误快照供下步自修；`Stop` 钩子 MUST 检查循环防护标志并在未达标时返回强制继续指令与结构化修复提示（达到熔断次数阈值后放行并报告人工）

### Requirement: 两阶段生命周期与底座锁定（Bootstrap vs Locked Steady-State）
系统 SHALL 在项目配置文件中维护 `bootstrapLocked` 生命周期开关以区分「Stage A 架构奠基期（允许一次性重构底座）」与「Stage B 稳态日常迭代期（核心框架与规范硬锁定）」。

#### Scenario: bootstrapLocked 为 true 时拦截日常需求顺带篡改框架底座
- **WHEN** 项目处于 `bootstrapLocked: true` 稳态期，普通日常迭代或小模型尝试修改 `.harness/`、`.agents/`、`.github/`、核心调度脚本或架构契约底座
- **THEN** 原生 `PreToolUse` 钩子与 CI 风险门禁 MUST 双层拒绝该修改，提示日常仅可在各自业务模块岛内高速迭代

#### Scenario: 维护者显式解锁执行重大框架升级
- **WHEN** 维护者在主窗口显式下达解锁指令并通过专属解锁命令将 `bootstrapLocked` 临时设为 `false`
- **THEN** 系统 SHALL 记录本次框架解锁审计原因并开放底座改造通道，待该架构变更合流通过验收后重新自动上锁

### Requirement: 契约冻结与互斥路径切片所有权（Contract-First & Disjoint Ownership）
系统 MUST 要求并发写码启动前先完成共享接口契约与跨模块集成测试骨架冻结；支持确定性切片规划器按物理模块岛划分并发切片卡（`.harness/slices/<id>.json`），显式声明 `ownedPaths`、`forbiddenPaths`、`maxDiffLines`（≤300）与 `retryCount`，且并发切片 `ownedPaths` 交集 MUST 为空。

#### Scenario: 契约未冻结前派发并行切片
- **WHEN** 状态机尚未进入 `CONTRACT_FROZEN` 而尝试激活多个并行写码切片
- **THEN** Harness 协调器 MUST 阻断并行启动并要求先合入“契约冻结提交”

#### Scenario: 主控运行小模型时调用确定性切片规划器按模块岛并发拆解
- **WHEN** 主控直接运行 3.8 Flash 等小模型在需求确认与契约冻结后需要高并发执行多条路线
- **THEN** 主控 SHALL 调用确定性切片规划器基于物理模块岛边界生成多张互不重叠的 `ownedPaths` 切片卡，确保各并发路线物理隔离

#### Scenario: 两个并发切片声明了重叠路径或超出行数限制
- **WHEN** 新注册切片的 `ownedPaths` 与已激活切片存在交集，或执行时修改了非授权路径及有效 diff 超过 300 行
- **THEN** 校验命令 MUST 立即报错退出并阻断激活或合流

### Requirement: 大小模型路由矩阵与并发隔离（Model Routing & Worktree Isolation）
系统 SHALL 依据任务风险区分高阶模型与低成本小模型准入边界，同时支持小模型主控在确定性切片与钩子护栏下对低/中风险模块岛切片进行多 `git worktree` 高速并发开发，且每个并发实例 MUST 具备独立端口与临时数据目录。

#### Scenario: 仅在契约冻结后向并发工作树派发低/中风险切片
- **WHEN** 变更进入 `CONTRACT_FROZEN` 状态且所有目标切片均标记为低风险或中风险、路径互斥
- **THEN** 系统 SHALL 允许多个小模型在不同 `git worktree` 中并发开工，且各并发实例使用彼此隔离的随机测试端口与独立临时用户数据目录

#### Scenario: 拦截小模型越权认领高风险核心切片
- **WHEN** 执行身份为小模型（或低配执行器）尝试认领涉及核心引擎、鉴权协议、IPC 主进程安全边界或工作流配置文件的高风险切片
- **THEN** 路由守卫 MUST 拒绝派发并要求路由至高阶推理模型处理或挂起人工审批

### Requirement: 连续失败自动熔断与升级机制（Circuit Breaker & Escalation）
系统 MUST 对小模型执行切片设置连续失败计数；当同一切片连续 2 次未能通过机械校验门禁时，系统 SHALL 立即触发熔断并升级至高阶模型或维护者接管。

#### Scenario: 同一切片连续两次未通过门禁校验
- **WHEN** 小模型对同一切片连续第 2 次触发门禁失败，`retryCount` 达到阈值 2
- **THEN** 系统 MUST 自动将切片状态置为 `status: "escalated"`，锁定并阻断小模型发起第 3 次盲改，同时释放 `Stop` 钩子循环并输出包含精简失败上下文的升级报告
