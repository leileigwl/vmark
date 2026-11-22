# Session Handoff（覆盖式进度快照）

> 本文件实行 **覆盖式快照规范（硬上限 ≤ 120 行）**，禁止无限追加过时轮次流水账。完整历史需求截图根因、交互原型与测试用例映射台账均留存在 [`docs/requirement-journal.html`](requirement-journal.html) 中。

- **快照日期**：2026-11-22
- **当前分支与里程碑**：`slice/review-artifacts-and-risk-tuning`（基于 `test` @ `12a72bb`）——**Step 1：接入 `GLM-5.3-Flash` 双段式 AI Review、Verification Artifacts PR 模板、分层风险规则与 CI 耗时修正**
- **最新基线版本**：`v0.2.0`（PR #37 / #35 / #34 / #38 已合入，Issue #36 冻结锁已解除）
- **护栏约束**：红黄绿路径与单文件 `<= 500` 行边界详见 [OPERATOR_PLAYBOOK.md](OPERATOR_PLAYBOOK.md)；本 PR 合入 `test` 后需立即执行 `pnpm harness:lock-bootstrap` 提交独立重锁 PR

## 本轮已完成（Step 1：防盲审与额度优化底座）

1. **GitHub Actions 模型入口配置**：
   - 已安全注入 GitHub Secret `AI_REVIEW_API_KEY`（来自未入库 `secret.txt`）与公开变量 `AI_REVIEW_MODEL=GLM-5.3-Flash`、`AI_REVIEW_BASE_URL=https://api.scnet.cn/api/llm/v1`。
   - `.gitignore` 已屏蔽 `secret.txt`、`*.secret.txt`、`.env.*`、`.harness/.last-violations.json`，严防本地密钥意外入库。
2. **两段式省额度 AI Code Review（Fork 安全隔离）**：
   - `.github/workflows/ai-review.yml` 过滤 lockfile 与图片等二进制差异，统计 `reviewableLines` 并提取 PR 标题/正文摘要。
   - `.github/workflows/ai-review-post.yml` 对纯文档/资源 PR 自动跳过，对 `>40` 行或初检有疑点 PR 执行「Pass 1 Bug 狩猎 → Pass 2 独立去误报」交叉审查，幂等更新中文验收清单并仅在存在 `critical` 真 Bug 时单向升级 `risk:high`。
3. **风险规则调优与 Verification Artifacts 规范**：
   - `.github/risk-rules.yml` 将 `packages/core/**`、`packages/adapters/**`、`packages/image-pipeline/**` 调至 `mid`（`shared` / `main` / `preload` / `.github` / `.harness` / 鉴权仍严守 `high`，AST 导出变更与敏感语义仍自动升级）。
   - 升级 `.github/PULL_REQUEST_TEMPLATE.md` 固化「大白话改动说明 + 验证产物 + 1 分钟验收清单」（保留凭据自检与 AGPL-3.0/CLA 条款），并修复 `.github/workflows/daily-release-pr.yml` 中 `Ubuntu CI 平均耗时` 异常统计口径。

## 后续排队里程碑（重锁底座后依次切片推进）

1. **Step 2（小红书/抖音双模式 + 模板透传修复）**：拆分 `xiaohongshuRenderer.ts` 支持正文插图与表格同卡渲染；修复 `publishSocialDrafts.ts` 模板白名单与「视觉卡片（默认）/ 原图」双开关。
2. **Step 3（分发持久化 + 实时进度 + 失败重试）**：冻结 `publish:getRecords` / `publish:progress` 契约，主进程原子 JSON 落盘 `userData/sync_records.json`，支持逐平台状态回显与仅重试失败项。
3. **Step 4（`PublishModal` 清爽重排 + 授权秒显）**：拆瘦 `PublishModal.tsx` 至 `features/publish-drawer/`，优化 `accountStore` 缓存秒显与内置浏览器 Tab 体验。
