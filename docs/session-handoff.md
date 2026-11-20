# Session Handoff（覆盖式进度快照）

> 本文件实行 **覆盖式快照规范（硬上限 ≤ 120 行）**，禁止无限追加过时轮次流水账。完整历史与视觉图鉴均留存在 [`docs/requirement-journal.html`](requirement-journal.html) 与 `openspec/changes/archive/` 中。

- **快照日期**：2026-11-21
- **当前阶段**：**多题材社交媒体卡片比例精调、HTML 原型与需求视觉图鉴先行、桌面端预览升级 (`slice/social-card-generator`)**
- **最新基线版本**：`v0.1.0`（`master` @ `5c51dde` / `test` @ `c93e981`）
- **当前底座锁状态**：`bootstrapLocked: true`（底座硬锁定，红黄绿边界见 [OPERATOR_PLAYBOOK.md](OPERATOR_PLAYBOOK.md)）
- **样式与 UI 迭代铁律**：**先更新交接文档 → 先做 HTML 交互原型与真实配套图预览调优（[`docs/requirement-journal.html`](requirement-journal.html)）→ 视觉比例确认达标后再落盘 React 组件与 E2E 测试**。

## 已完成与进行中里程碑

1. **开源合规、宪法文档收敛与操作手册（Phase 0）**：
   - 完成全 Git 历史敏感凭据/路径清理，落盘 **AGPL-3.0-only（`LICENSE`）+ 商业双授权（`LICENSE-COMMERCIAL.md`）**，`leileigwl/vmark` 已切换为 `PUBLIC`（GitHub Hosted macOS/Windows/Ubuntu Runner 全免费）。
   - 收敛 [`AGENTS.md`](../AGENTS.md)（36 行）、[`docs/OPERATOR_PLAYBOOK.md`](OPERATOR_PLAYBOOK.md)、[`docs/ARCHITECTURE.md`](ARCHITECTURE.md)。
2. **确定性 Harness + 原生 Hook 硬锁（Phase 1–3）**：
   - `.harness/` Schema 与 `scripts/harness/`（`anti-cheat`、`ratchet`、`risk-classifier`、`arch-graph`、`slice-lock`）。
   - 7 大历史超标文件全部拆至 `<= 469` 行（棘轮总基线 `5253 -> 2216` 行）。
3. **本轮重点：个人多题材 3:4 满版杂志卡片、多平台封面自适应与 HTML 原型图鉴（Phase 5）**：
   - **比例与排版整改**：消除 `1080×1440` 垂直居中造成的 35% 上下死白，改为 **满版杂志网格布局（内容占比 78%~86%）**（顶栏刊头 + 题材胶囊与大标题 + 结构化正文/引语高亮卡 + 底部核心看点/金句条带 + 页脚）。
   - **代码块不断词**：移除 `word-break: break-all`，采用自适应字号（`18px~23px`）+ `overflow-wrap: anywhere` + 行号顶部对齐。
   - **多题材个人创作自适应**：彻底去除写死的“前端开发/极客指南”假文案，支持 **旅行日记 (`travel`)、个人随笔 (`essay`)、读书札记 (`reading`)、技术实践 (`tech`)** 四大题材自动识别与真实摘要/金句/标签提取。
   - **多平台封面比例留口与 UGC 模板兜底**：预留显式封面图（`cover:`），未上传封面时自动适配 `3:4`（小红书/抖音图文）、`9:16`（抖音全屏）、`16:9`（知乎/百家号/B站）、`2.35:1`（公众号头条）UGC 封面模板。
   - **HTML 原型与需求记录图鉴**：落盘 [`docs/requirement-journal.html`](requirement-journal.html)，集中记录每次需求讨论、Bug 根因、整改前后图片对比与桌面端 `PlatformPreviewPane` 交互原型。

## 验证边界诚实声明（L1–L4 严格分层）

- **L0/L1（本地与 CI 确定性静态/单测）**：`pnpm harness:check --json`、`pnpm run typecheck`、`pnpm turbo run test`。
- **L2（Mock IPC 渲染层 Web E2E）**：`apps/desktop/playwright.config.ts` 验证渲染、编辑体验与多平台高保真卡片预览切换。
- **L3（真实 Electron 主进程无头冒烟）**：`apps/desktop/tests/electron-smoke.spec.ts` 在本地与 Ubuntu CI（`xvfb-run`）拉起真实 `electron`。
- **L4（真实第三方平台线上联调）**：仅在本地实机按需手动验收。

## 后续日常行动

1. 先查看 [`docs/requirement-journal.html`](requirement-journal.html) 原型与 [`docs/vmark_social_cards_visual_report.md`](vmark_social_cards_visual_report.md) 真实渲染图，再推进 React UI 与 CI 测试。
