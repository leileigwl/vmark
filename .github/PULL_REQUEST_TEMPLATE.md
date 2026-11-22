## 一、大白话改动说明
<!-- 用 2~3 句人话解释：这次改了什么、解决了什么问题、会影响哪些功能（关联 Issue 如 Closes #12） -->

- 

## 二、验证产物（Verification Artifacts — 审 PR 先看这里）
<!-- 单人维护不靠硬啃 Diff 盲审，优先提供可直观验证的产物 -->

### 行为前后对比
| 场景 | 改动前 | 改动后 |
| :--- | :--- | :--- |
|  |  |  |

### 截图 / 渲染图 / 台账
- 视觉截图或台账链接（如有 UI/卡片改动必附，如 `docs/requirement-journal.html` 或 PR 贴图）：

### 本地门禁与安全自检
- [ ] 已本地运行 `pnpm harness:check --json` 且返回 0 违规
- [ ] 已运行 `pnpm run typecheck && pnpm turbo run test`
- [ ] 若改动 UI/编辑器，已确认通过 Playwright E2E（未通过 `.skip` / `as any` 绕过）
- [ ] 我确认未在代码中硬编码任何个人本机路径、Cookie、Token 或真实 API Key

## 三、人工 1 分钟验收清单
- [ ] 

## 四、风险分级与回滚说明
- **`pnpm harness:design-risk` 预检等级**：`[risk:low | mid | high]`
- **是否触及契约 / 鉴权 / 底座（`shared` / `preload` / `main` / `.github` / `.harness`）**：否 / 是（说明影响面）
- **回滚方式**：如有异常可直接 revert 本 PR Squash 提交

## 开源与双授权贡献确认（外部贡献者必选 / CLA-DCO）

> 本项目采用 **GNU AGPL-3.0-only + 商业付费双授权**，详情见 [LICENSE-COMMERCIAL.md](../LICENSE-COMMERCIAL.md)。

- [ ] （外部贡献者勾选）我确认对本 PR 提交的内容拥有完整权利，并同意依据 [LICENSE-COMMERCIAL.md](../LICENSE-COMMERCIAL.md) 在 AGPL-3.0 与商业授权双重许可下授予 `@leileigwl` 使用与再分发权限。
