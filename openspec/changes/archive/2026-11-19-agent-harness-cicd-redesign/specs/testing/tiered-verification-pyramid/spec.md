# Spec Delta

## Purpose

建立「L0 机械守卫 → L1 单测与前后端 IPC 契约 → L2 并发隔离 Web E2E → L3 真实运行时集成冒烟/压测 → L4 实机联调隔离」的五层测试金字塔，同时定义可跨项目复用的 `desktop-electron` 与 `web-service` 双 Profile 验证标准。

## ADDED Requirements

### Requirement: 五层按风险触发测试金字塔（L0–L4）
系统 SHALL 依据改动风险等级与变更路径精确调度 L0–L4 五层验证，杜绝全量串行阻塞与跨层假绿，并 MUST 在报告中严格区分 Mock 验证与真实集成/实机结果：L0（<15s 极速静态与类型门禁）、L1（<10s 包级单测与前后端三端 IPC 契约校验）、L2（Ubuntu 并行 Web E2E，纯文档改动跳过）、L3（高风险/合入 `test`/每日汇总触发，按 Project Profile 运行真实集成冒烟/压测）与 L4（人工显式触发本地实机联调）。

#### Scenario: 仅修改文档或 OpenSpec 时的路径分流
- **WHEN** PR 仅变更 `docs/**`、`openspec/**` 或根目录 Markdown 文件且未触及任何源码与配置文件
- **THEN** CI SHALL 仅运行 L0 文档校验与防腐检查，自动跳过耗时的 L1 单测、L2 Playwright 与 L3 真实环境构建

#### Scenario: 前端与后端接缝不匹配时的 IPC 契约拦截
- **WHEN** 前端渲染层先行新增或修改了对某个 `electronAPI` 方法的调用签名，而 `preload` 桥接、共享契约类型或 `main` IPC Handler 尚未匹配注册
- **THEN** L1 IPC 契约测试 MUST 在 10 秒内失败退出，阻断带着断裂接缝合入并行切片

#### Scenario: 多个并发 Worktree 同时运行 L2 Playwright E2E
- **WHEN** 多个小模型在不同 `git worktree` 中同时执行 Playwright E2E 验证
- **THEN** 测试启动器 SHALL 自动分配空闲动态端口并绑定独立的临时目录（禁止硬编码共享固定端口或全局用户目录），确保并发执行互不抢占端口与状态污染

#### Scenario: L1/L2 Mock 绿灯不可冒充 L4 实机平台联调
- **WHEN** 仅完成了 L1 Mock 单元测试或 L2 Web 渲染层 E2E 回归
- **THEN** 自动化汇报与交接快照 MUST 标记为 Mock 通过，严禁宣称已完成真实外部平台（微信公众号/知乎/百家号等）的 L4 实机发布验证

### Requirement: 跨项目可复用测试 Profile 规范与可执行模板资产（desktop-electron 与 web-service）
Harness 验证标准 SHALL 通过 `.harness/project.json` 中的 `profile` 字段适配不同软件形态，并随标准工具包交付可直接使用或定制的可执行 Profile 验证模板，避免跨项目复用停留在纯文字清单层面。

#### Scenario: desktop-electron Profile 执行 L3 真 Electron 冒烟测试
- **WHEN** 项目 `profile` 为 `desktop-electron`（如 `vmark`）且触发 L3 验证
- **THEN** CI MUST 在无头显示环境（如 Ubuntu 下 `xvfb-run`）拉起真实编译后的 Electron 二进制应用，校验主进程窗口成功渲染无白屏崩溃、Preload `electronAPI` 挂载完整、SQLite 本地索引可读写，以及沙箱 Partition 与基础 IPC 往返正常

#### Scenario: web-service Profile 交付可执行容器冒烟、迁移回滚与 k6 压测资产
- **WHEN** 未来互联网后端项目采用本工具包并配置 `profile` 为 `web-service`
- **THEN** 初始化工具包 SHALL 直接落盘以下可执行模板资产与自动化门禁脚本：
  1. **容器编排冒烟模板**：带隔离 DB（Postgres/MySQL）与缓存（Redis）容器的集成与核心 API 黄金路径探针脚本；
  2. **数据库迁移双向校验脚本（`migration-check`）**：自动执行 `migration up -> seed -> migration down -> migration up` 校验可逆性与零表结构残留；
  3. **可执行 `k6` 基准压测脚本与阈值配置（`k6-smoke.js` + 阈值 JSON）**：对核心读写接口施加并发压测，机器强校验 P95/P99 延迟基线、请求错误率 `< 0.1%`、吞吐量与持续压测内存斜率不越界
