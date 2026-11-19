# cicd/risk-tiered-automerge-and-review Specification

## Purpose
规范基于「路径规则 + TypeScript AST + 语义信号」的三层确定性风险检测、Ubuntu 并行 CI 与串行合流锁、Fork 安全隔离 AI 自动审查、Drain & Freeze 每日零冲突汇总与 5 指标 GitHub `@mention` 邮件反推、安全自愈以及 AGPL-3.0 商业双授权公开合规门禁。

## Requirements

### Requirement: 三层确定性风险检测（Path + AST + Semantic Signals）
系统 SHALL 通过 `.github/risk-rules.yml` 与确定性风险分类引擎联合判定 `risk:low`、`risk:mid` 或 `risk:high`（取最高风险级），绝不依赖 Markdown 文本自觉或单纯文件名猜测：结合路径与行数上限（300 行）、TypeScript AST 导出签名/公共契约拓扑分析及 Diff 敏感语义扫描（IPC 频道、鉴权/Cookie/Token、SQL、密钥、`process.env`/`child_process`），命中高危语义立即升为 `risk:high`。

#### Scenario: 跨路径修改或行超限触发最高级覆盖
- **WHEN** 一个 PR 同时修改 `docs/PRODUCT.md`（低风险）与 `apps/desktop/src/main/publishHandlers.ts`（高风险），或渲染层切片改动超过 300 行、触及 `pnpm-lock.yaml`
- **THEN** 风险分级引擎 MUST 判定整张 PR 为 `risk:high` 并打上 `risk:high` 标签

#### Scenario: AST 检测到中低风险目录悄悄变更导出公共类型或模块边界
- **WHEN** PR 仅修改中风险特征岛代码但 TypeScript AST 对比发现模块 Barrel `index.ts` 对外导出接口签名发生破坏性变更或新增跨岛依赖
- **THEN** 风险分类引擎 MUST 机械升级风险至 `risk:high` 并禁止未审批自动合入

#### Scenario: Diff 语义扫描命中未报备高危敏感操作模式
- **WHEN** 任何表面看似低/中风险的 PR 在源码 Diff 中引入 `ipcRenderer`、`safeStorage`、`child_process`、`eval`/`Function`、Cookie 读写或硬编码环境变量注入模式
- **THEN** 语义风险扫描器 MUST 自动将该 PR 升级为 `risk:high` 并在 PR 评论中列出命中的精确行号与规则编号

#### Scenario: 仅改动纯文档、OpenSpec 或测试文件（无导出与语义越界）
- **WHEN** PR 仅修改 `docs/**`、`openspec/**`、`*.md` 或测试文件且未新增任何 `.skip`、未改动生产导出契约与风险配置
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
系统 SHALL 严格校验 PR 来源并区分支配策略：同仓受信任自有分支的 `risk:low` 与全绿 `risk:mid` 自动 Squash 合入 `test` 并删分支，`risk:high` 与底座锁定后任何框架改动 MUST 等待 `leileigwl` 评论 `/approve`；外部 Contributor/Fork PR 同享全面体检、AI Review 与双授权 CLA 提示，但严禁自动合入。

#### Scenario: 自有分支高风险 PR 缺失维护者显式 /approve
- **WHEN** 同仓库 PR 标有 `risk:high` 且 CI 全绿，但尚无 `leileigwl`（或具管理员权限维护者）发表的 `/approve` 审批指令，或评论者为非授权账号
- **THEN** `risk-gate` MUST 拒绝自动合并并保持 PR 处于等待审阅状态

#### Scenario: 外部 Fork PR 全绿完成审查
- **WHEN** 外部 GitHub 用户通过 Fork 提交了全绿且风险等级为 `risk:low` 的 PR
- **THEN** 系统 SHALL 正常发布完整机器体检报告、AI 逐行建议与 CLA/DCO 提醒，但 MUST NOT 自动合入 `test` 或 `master`

### Requirement: Fork 安全隔离的 AI 自动 Review 层
系统 MUST 采用两段式权限隔离架构运行线上的 AI 自动审查（默认兼容 DeepSeek / OpenAI 协议）：第一阶段无密钥 `pull_request` 仅导出只读 Diff Artifact；第二阶段仅授权 `workflow_run` 读 Artifact 与 `DEEPSEEK_API_KEY` 调模型评注。AI Review SHALL 只允许单向调高风险至 `risk:high`，且无 Key 时优雅降级不挂 CI。

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
- **THEN** 系统 MUST 立即打上熔断暂停标记阻止后续 PR 继续合入 `test`，且仅针对最近一次合入提交自动创建 **唯一 1 个** `Revert` PR 与告警 Issue 并 `@leileigwl`，严禁在已有 Revert PR 未合入前循环连环 Revert

### Requirement: 单窗口 GitHub 邮件反推与每日 5 指标仪表盘
为适配维护者日常单 Antigravity 窗口配合 GitHub 邮件处理异常的轻量工作流，系统 SHALL 在全部关键异步事件自动产生带结构化上下文与 `@leileigwl` 提及的 GitHub 通知，确保维护者无需驻守监控面板。

#### Scenario: 每日汇总 PR 内嵌 5 项健康指标并邮件通知维护者
- **WHEN** 每日 `daily-release-pr` 生成或刷新当日 `test -> master` 汇总 PR
- **THEN** PR 正文 MUST 自动生成「每日 5 项核心指标仪表盘」（自动合入率、小模型连续 2 次熔断率、合流回归与 Revert 次数、棘轮/AI Slop 净变化量、Ubuntu CI 平均耗时）并在结尾 `@leileigwl` 触发 GitHub 邮件直达

#### Scenario: 需人工介入事件实时邮件反推至单窗口处理
- **WHEN** 每周 Cron 《AI Slop 周报体检》产出待清理切片、高风险 PR 等待 `/approve`、或 `auto-revert` 发生阻断熔断
- **THEN** GitHub Actions MUST 通过 Issue/PR 评论显式 `@leileigwl` 发送邮件通知，并提供单窗口一行可复制触发上下文（如 Issue/PR 编号），方便维护者直接在唯一工作窗口拉起处置

### Requirement: 公开前全历史安全审计与 AGPL-3.0 商业双授权合规
在将 `leileigwl/vmark` 切换为 Public 仓库前，系统 MUST 先完成全 Git 历史敏感信息清理与双授权协议落盘。

#### Scenario: 切 Public 前执行全历史敏感信息审计
- **WHEN** 准备执行将私有仓转为公开仓任务
- **THEN** 审计工具 MUST 扫描全部分支与 Git Commit 历史，确认不存在真实 API Key、平台 Cookie/Token（如 `BDUSS`、`SESSDATA`）或含敏感凭据文件；如检出风险必须先清理历史并轮换凭据后再公开

#### Scenario: 建立 AGPL-3.0-only 与商业双授权文件及外部 PR CLA 提示
- **WHEN** 仓库处于 Public 开源状态且外部用户提交 PR
- **THEN** 根目录 MUST 包含标准 GNU Affero General Public License v3.0（`LICENSE`）与商业付费授权说明（`LICENSE-COMMERCIAL.md`），且 PR 模板或自动机器人 MUST 提醒外部贡献者确认遵循本仓双授权贡献条款（CLA/DCO），同时许可检查门禁不得漏过不兼容第三方依赖许可证
