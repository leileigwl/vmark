# Spec Delta

## Purpose

规范基于单一配置源 `.github/risk-rules.yml` 的风险分级自动合入流水线、Ubuntu 高性价比并行 CI、Fork 安全隔离 AI 自动审查、Drain & Freeze 每日零冲突汇总、安全合流回归自愈以及开源公开前安全与 AGPL-3.0 + 商业双授权合规门禁。

## ADDED Requirements

### Requirement: 风险分级规则单源化（.github/risk-rules.yml）
系统 SHALL 通过根目录 `.github/risk-rules.yml` 作为风险判定的唯一配置源，按改动路径集合与有效改动行数**取最高风险级**自动计算 `risk:low`、`risk:mid` 或 `risk:high`：核心包、主进程/Preload、依赖锁文件、CI/Harness 护栏、授权文件、含密钥路径、AI Review 调高或改动超 300 行均判为 `risk:high`；渲染层组件与脚本 `<300` 行为 `risk:mid`；仅文档、OpenSpec 或测试文件为 `risk:low`。

#### Scenario: 跨路径修改遵循“最高级覆盖”原则
- **WHEN** 一个 PR 同时修改了 `docs/PRODUCT.md`（低风险）与 `apps/desktop/src/main/publishHandlers.ts`（高风险）
- **THEN** 风险分级引擎 MUST 判定整张 PR 为 `risk:high`，并打上 `risk:high` 标签

#### Scenario: 中风险路径但改动行数超限或触及锁文件
- **WHEN** 一个仅改 `renderer` 的 PR 总改动行数超过 300 行或顺带修改了 `pnpm-lock.yaml`
- **THEN** 风险分级引擎 MUST 自动将其升级为 `risk:high`

#### Scenario: 核心引擎与平台适配器修改判定为高风险
- **WHEN** PR 触及 `packages/core/**`、`packages/adapters/**`、`packages/image-pipeline/**`、`packages/shared/**`、`apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、`.github/**`、`.harness/**`、`scripts/harness/**` 或 `LICENSE*`
- **THEN** 风险分级引擎 MUST 自动标注 `risk:high` 并禁止未审批自动合入

#### Scenario: 仅改动文档或测试文件判定为低风险
- **WHEN** PR 仅修改 `docs/**`、`openspec/**`、`*.md` 或测试文件且未修改源码与配置
- **THEN** 风险分级引擎 SHALL 自动标注 `risk:low` 并允许按规则免 E2E 快速合入

### Requirement: Ubuntu 并行 CI 与串行合流锁（Cost-Optimized CI & Merge Serialization）
日常 PR 与分支验证 CI SHALL 全面迁移至 `ubuntu-latest` 运行（拆分 L0 静态门禁、L1 单测+IPC 契约、L2 Playwright E2E 为并行 Job 并启用 pnpm + Turbo 缓存及同分支并发取消），仅在推送 `v*` 发版 Tag 时触发 `macos-latest` 与 `windows-latest` 三端打包；自动合入 `test` 阶段 MUST 通过 `concurrency: merge-test` 串行队列加“合前同步 `test` 并重跑校验”避免多 PR 竞态冲突。

#### Scenario: 日常 PR 仅唤醒 Ubuntu Runner
- **WHEN** 针对 `test` 或 `feature-*` 提交普通开发 PR
- **THEN** CI SHALL 仅分配 `ubuntu-latest` 并发执行对应测试层级，不启动 10 倍计费的 `macos-latest` Runner

#### Scenario: 多个自动合入 PR 同时通过绿灯准备入 test
- **WHEN** 两个合格 PR 同时进入 `risk-gate` 自动合入流程
- **THEN** `concurrency: merge-test` MUST 保证同一时刻仅 1 个 PR 处于合入临界区；第 2 个 PR 合入前必须先同步最新 `test` 基线并确认校验仍全绿，方可执行合入

### Requirement: 信任分支分级自动合入与外部 PR 安全隔离
系统 SHALL 严格校验 PR 来源并区分支配策略：
- **受信任自有分支**（同仓库非 Fork 且发起人为 `leileigwl` 或受控协作身份）：`risk:low` 与全绿 `risk:mid` PR 通过门禁后自动 `--squash` 合入 `test` 并删除源分支；`risk:high` PR MUST 挂起并在全部测试通过后等待 `leileigwl` 在评论区输入 `/approve` 才执行合入。
- **外部贡献者 / Fork PR**：MUST 享受同等的 L0–L2 全套机械体检、AI 逐行 Review 反馈及双授权 CLA/DCO 提示，但**严禁触发任何自动合入动作**，必须保留人工最终合并权。

#### Scenario: 自有分支高风险 PR 缺失维护者显式 /approve
- **WHEN** 同仓库 PR 标有 `risk:high` 且 CI 全绿，但尚无 `leileigwl`（或具管理员权限维护者）发表的 `/approve` 审批指令，或评论者为非授权账号
- **THEN** `risk-gate` MUST 拒绝自动合并并保持 PR 处于等待审阅状态

#### Scenario: 外部 Fork PR 全绿完成审查
- **WHEN** 外部 GitHub 用户通过 Fork 提交了全绿且风险等级为 `risk:low` 的 PR
- **THEN** 系统 SHALL 正常发布完整机器体检报告、AI 逐行建议与 CLA/DCO 提醒，但 MUST NOT 自动合入 `test` 或 `master`

### Requirement: Fork 安全隔离的 AI 自动 Review 层
系统 MUST 采用两段式权限隔离架构运行线上的 AI 自动审查（默认兼容 DeepSeek / OpenAI 协议）：第一阶段无密钥 `pull_request` 工作流仅提取只读代码 Diff 并存为 Artifact；第二阶段仅授权 `workflow_run` 工作流读取 Artifact 与 `DEEPSEEK_API_KEY` 调模型生成逐行 Review 建议。AI Review 结果 SHALL 遵守**单向调高风险原则**（若发现隐蔽安全/契约风险可将 `risk:low`/`risk:mid` 升为 `risk:high`，**绝不允许降低机械判定的风险等级**），且在未配置 API Key 时优雅降级为跳过 AI 审查而不使正常 PR CI 失败。

#### Scenario: 外部 Fork PR 触发 AI Review 时隔离密钥访问
- **WHEN** 不可信 Fork 提交包含恶意脚本改动 `package.json` 或测试脚本的 PR
- **THEN** 第一阶段执行测试时 CI Env 中 MUST NOT 挂载任何 Secrets；第二阶段调 AI 模型时 MUST NOT 检出或执行 Fork 仓库的任意代码

#### Scenario: AI 审查发现隐患单向提升风险 vs 尝试降级被忽略
- **WHEN** 机械判定为 `risk:mid` 的 PR 被 AI 审查识别出存在潜在 IPC 竞态或 Cookie 泄漏风险
- **THEN** 工作流 SHALL 自动追加 `risk:high` 标签阻断自动合入；反之若 AI 认为 `risk:high` PR 无问题，标签 MUST 维持 `risk:high` 不变

#### Scenario: 仓库尚未配置 DEEPSEEK_API_KEY
- **WHEN** 仓内 Secrets 未配置 `DEEPSEEK_API_KEY`（或外部密钥未就绪）
- **THEN** `ai-review` 工作流 SHALL 输出清晰降级说明并正常以中性/成功状态退出，不阻断 L0–L3 确定性机械门禁运转

### Requirement: Drain & Freeze 每日零冲突汇总与合流自愈（Auto-Revert）
系统 SHALL 每日定时（默认 21:00 CST，同时支持手动触发）执行「排空 + 冻结窗口（Drain & Freeze）」机制以零冲突将 `test` 汇总至 `master`；若 `test` 分支在自动合流后出现回归变红，系统 MUST 启动安全自愈保护。

#### Scenario: 每日汇总前启用 Drain & Freeze 并采用 Merge Commit 同步
- **WHEN** 每日汇总窗口开启，工作流排空当前 `merge-test` 队列并为仓库加上 `freeze:release-window` 锁后，基于最新 `test` 与 `master` 差异生成/更新当日 `test -> master` 汇总 PR
- **THEN** 冻结期内新到达的合格 PR SHALL 只跑 CI 等待、暂缓合入 `test` 避免产生汇总冲突；当维护者在汇总 PR 上验手感确认并用 **Merge Commit** 合入 `master` 后，自动化流程 SHALL 将 `master` 同步回 `test` 并解除冻结锁

#### Scenario: test 分支合入后发生回归变红（Safe Auto-Revert）
- **WHEN** PR 刚自动合入 `test` 后触发的 `test` 主干回归流水线（含 L3）失败
- **THEN** 系统 MUST 立即打上熔断暂停标记阻止后续 PR 继续合入 `test`，且仅针对最近一次合入提交自动创建 **唯一 1 个** `Revert` PR 与告警 Issue，严禁在已有 Revert PR 未合入前循环连环 Revert

### Requirement: 公开前全历史安全审计与 AGPL-3.0 商业双授权合规
在将 `leileigwl/vmark` 切换为 Public 仓库前，系统 MUST 先完成全 Git 历史敏感信息清理与双授权协议落盘。

#### Scenario: 切 Public 前执行全历史敏感信息审计
- **WHEN** 准备执行将私有仓转为公开仓任务
- **THEN** 审计工具 MUST 扫描全部分支与 Git Commit 历史，确认不存在真实 API Key、平台 Cookie/Token（如 `BDUSS`、`SESSDATA`）或含敏感凭据文件；如检出风险必须先清理历史并轮换凭据后再公开

#### Scenario: 建立 AGPL-3.0-only 与商业双授权文件及外部 PR CLA 提示
- **WHEN** 仓库处于 Public 开源状态且外部用户提交 PR
- **THEN** 根目录 MUST 包含标准 GNU Affero General Public License v3.0（`LICENSE`）与商业付费授权说明（`LICENSE-COMMERCIAL.md`），且 PR 模板或自动机器人 MUST 提醒外部贡献者确认遵循本仓双授权贡献条款（CLA/DCO），同时许可检查门禁不得漏过不兼容第三方依赖许可证
