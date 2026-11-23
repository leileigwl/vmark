# CHANGE_MAP：改哪里会影响什么（单人维护速查）

> 用途：动手前先查这张表，知道改的文件属于哪一层、会连带影响什么、必须跑哪些命令、风险多高。
> 风险等级与 `.github/risk-rules.yml` 一致：**high** 需要维护者 `/approve`；**mid** 可自动合入 `test`（要跑 E2E）；**low** 仅文档/测试。
> 规则来源：[AGENTS.md](../AGENTS.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[UI_GUIDE.md](UI_GUIDE.md)、`.harness/project.json`。本文件只做索引，不替代它们。

## 改之前必看 5 件事

1. **只推草稿箱**：所有平台默认 `mode: 'draft'`，只有自有站点 GitHub 博客直接上线。任何改动都不能把平台改成直发、也不能绕过“维护者人工确认”。
2. **凭据不出主进程、不进日志**：Cookie / Token / 图床密钥只能在主进程读写，渲染进程和 `console.*` 里零明文。登录态在 Electron 会话分区 `persist:platform_<id>` 里（`publishPlatformDispatch.ts`、`publishCnblogsDraft.ts`）。⚠️ AGENTS.md 写的是 `safeStorage` 落库，但目前代码里没有 `safeStorage` 调用，图床密钥在 `userData/vcat-config.json`（`main/ipc/context.ts`）——见文末 TODO。
3. **IPC 白名单是一份契约**：新增/改名通道必须同时改 `packages/shared/src/ipcContract.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/main/ipc/<domain>/index.ts` 三处，`tests/ipcContract.test.ts` 会 1:1 校验。能在 payload 里加**可选字段**解决的，就不要加通道。
4. **编辑器输入完整性是底线**：输入法组字、换行、配对括号、撤销、保存竞态任何回归都不可接受。改 `renderer/src/editor/**`、`components/VditorEditor.tsx`、`features/editor-ir/**` 必须跑完整编辑器 E2E（`editor` / `ime-input-integrity` / `save-race` / `shortcut-guards` / `tasklist-checkbox`）。
5. **底座受锁**：`.github/**`、`.harness/**`、`scripts/harness/**`、`.agents/hooks.json`、`.claude/settings.json`、`.githooks/**`、`AGENTS.md`、`LICENSE*` 改动前必须由维护者执行 `pnpm harness:unlock-bootstrap`，改完再 `pnpm harness:lock-bootstrap`。根 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` 属于 high 风险，AI 不要顺手改。

## 通用命令（所有层都要跑）

```bash
pnpm install --frozen-lockfile
pnpm harness:check --json            # 反作弊、行数棘轮、模块岛、文档死链；必须 0 违规
pnpm run typecheck
pnpm turbo run test                  # 各包单测 + desktop IPC/主进程 node 测试
pnpm --filter @vcat/desktop build    # electron-vite build（E2E 依赖它的产物）
NO_PROXY=127.0.0.1,localhost pnpm --filter @vcat/desktop exec playwright test --reporter=line
xvfb-run -a pnpm --filter @vcat/desktop test:electron-smoke   # L3 真 Electron 冒烟（high 风险必跑）
```

说明：E2E 在慢机器上可能因 Vditor 15 秒加载超时偶发失败，`--workers=2~3` 重跑；**不允许**用 `.skip` / 删断言 / `as any` 让它过。Mock E2E 不等于 L3 / L4，PR 里要写清楚跑到了哪一层。

## 分层速查

### 1. shared（契约层）— 风险 high

| 关键文件 | 内容 |
| --- | --- |
| `packages/shared/src/index.ts` | `MultiPlatformPublishPayload`（发布 payload）、`PlatformId`、`SOCIAL_MAX_CARDS`（小红书 18 / 抖音 35）、图床配置等全局类型 |
| `packages/shared/src/ipcContract.ts` | IPC 通道白名单（SSOT） |

- **影响**：主进程、preload、渲染层、适配器全部依赖这里。改字段名或改必填 = 破坏性变更。
- **规则**：只加**可选**字段；字段注释写清“谁传、什么格式（工作区相对路径还是绝对路径）”；`SOCIAL_MAX_CARDS` 改了要同步 `platformSpecSources.ts` 的出处。
- **必跑**：全部通用命令；重点 `tests/ipcContract.test.ts`、`tests/socialUploadImages.test.ts`、`tests/publish.spec.ts`（payload 断言）。

### 2. main（主进程）— 风险 high

| 关键文件 | 内容 |
| --- | --- |
| `apps/desktop/src/main/index.ts`、`main/ipc/registry.ts`、`main/ipc/<domain>/index.ts` | 窗口、协议、IPC 注册（按域拆岛，`index.ts` 受棘轮 ≤317 行） |
| `main/publishPlatformDispatch.ts` | 各平台草稿推送分发（会话分区、图片转存、调用适配器） |
| `main/publishSocialDrafts.ts`、`main/socialUploadImages.ts` | 小红书/抖音：永远上传生成的卡片；按 `SOCIAL_MAX_CARDS` 截断；上传封面插第 1 张；模板按 `getSocialCardTheme` 解析（与缩略图一致） |
| `main/socialCardImageBase.ts` | 卡片里相对路径图片 → `file://`，**防路径穿越**（越界/绝对路径/带协议一律不解析） |
| `main/publishWeixinDraft.ts`、`main/publishWeixinCover.ts` | 公众号草稿、2.35:1 封面 + 1:1 方图转存 mmbiz |
| `main/publishJuejinDraft.ts` | 掘金草稿：分类 / 摘要 / 标签 |
| `main/internalBrowserManager.ts`、`main/loginWindowBar.ts`、`main/publishSessionAuth.ts` | 平台登录窗口、登录检测、会话 |
| `main/accountStore.ts` | 平台账号**状态**（不含凭据），`userData/platform_accounts.json` |

- **影响**：凭据安全、草稿推送是否“假成功”、本地文件安全（任何读文件的入口都要做工作区越界检查）。
- **规则**：读用户给的路径必须 `path.resolve(root, rel)` 后校验 `startsWith(root + sep)`；不在日志里打印 Cookie/Token/响应体；新功能先抽纯函数到独立文件再写 node 测试（如 `socialUploadImages.ts`）。
- **必跑**：全部通用命令 + L3 冒烟；改登录相关跑 `tests/internalBrowserManager.test.ts`、`tests/loginWindowBar.test.ts`、`tests/publishSessionAuth.test.ts`。
- **L4（真平台）**：主进程推送逻辑改动只能由维护者登录真实后台确认，PR 里列出需要确认的平台和步骤。

### 3. preload（桥接层）— 风险 high

| 关键文件 | 内容 |
| --- | --- |
| `apps/desktop/src/preload/index.ts` | `window.electronAPI`，只透传白名单通道 |
| `apps/desktop/src/preload/stealthLogin.ts` | 登录窗口注入脚本 |

- **影响**：渲染层能调用什么。多暴露一个函数 = 扩大攻击面。
- **规则**：不暴露 `ipcRenderer` 本身、不暴露 Node API；payload 原样透传，不在 preload 做业务逻辑。
- **必跑**：通用命令 + `tests/ipcContract.test.ts` + L3 冒烟。

### 4. adapters（平台适配器）— 风险 mid

| 关键文件 | 内容 |
| --- | --- |
| `packages/adapters/src/index.ts` | `AdapterPushPayload`（含可选 `digest`）、各适配器导出、`JUEJIN_CATEGORIES` |
| `packages/adapters/src/<platform>.ts` | 微信、知乎、掘金、CSDN、博客园、百家号、微博、B 站、GitHub 静态 |

- **影响**：真实平台接口请求格式；改错会推送失败或推错字段。
- **规则**：只调用草稿接口；接口地址/字段来源写在注释里（抓包日期）；单测用假 fetch 断言请求体（参考 `juejin.test.ts`、`weixin.test.ts`）。
- **必跑**：`pnpm --filter @vcat/adapters test` + 通用命令；需要维护者 L4 确认草稿里字段是否生效。

### 5. core（排版与卡片引擎）— 风险 mid

| 关键文件 | 内容 |
| --- | --- |
| `packages/core/src/*Renderer.ts`、`digest.ts` | 各平台排版预览、摘要提取 |
| `socialCardBlocks.ts` → `socialCardPaginate.ts` → `xiaohongshuRenderer.ts` | 卡片：分块解析 → 按（实测）高度分页 → 生成卡片数据 |
| `socialCardHtml.ts`、`socialCardBlocksHtml.ts`、`socialCardLayout.ts`、`socialCardThemes.ts` | 卡片 HTML、排版常量、7 套模板与 `CARD_CHROME_INSETS` |
| `socialCardMath.ts` | KaTeX 公式接口（core 本身零依赖，KaTeX 由调用方注入） |
| `apps/desktop/src/main/socialCardRasterizer.ts`、`main/socialCardMath.ts` | 光栅化：测量页实测高度 → 分页 → 截图 1242×1656；测量页与出图用**同一个**公式渲染器 |

- **影响**：缩略图（渲染进程 `CardStrip.tsx`）和最终出图（主进程）**共用**这套代码，改一处两边都变；卡片张数变化会影响“超出平台上限”提示。
- **规则**：新增模板要同时加 preset、`CARD_CHROME_INSETS`、`socialCardHtml.ts` 的 chrome 分支和模板测试；core 保持零运行时依赖。
- **必跑**：`pnpm --filter @vcat/core test`、`tests/socialCardRasterizer.test.ts`、`tests/socialCards.spec.ts`；视觉改动再跑样张脚本并逐张看图：
  `cd apps/desktop && node --experimental-strip-types scripts/render-social-cards.ts /tmp/shots [themeId…]`（`NO_MATH=1` 关闭 KaTeX）。

### 6. renderer（界面）— 风险 mid

| 关键文件 | 内容 |
| --- | --- |
| `renderer/src/ui/*` + `styles/ui-tokens.css` | 基础组件与语义色令牌（规范见 [UI_GUIDE.md](UI_GUIDE.md)） |
| `features/platform-auth/*` | `usePlatformAuth`：登录状态唯一来源 |
| `features/publish-flow/*` | 发布弹窗：`PublishDialog`、`AttentionList`（需要单独处理）、`CardStrip`、`CoverField`、`platformSpecs.ts`（平台规则）、`platformSpecSources.ts`（规则出处）、`runPublish.ts`（拼 payload） |
| `editor/*`、`components/VditorEditor.tsx`、`features/editor-ir/*` | 编辑器（输入完整性底线，见“必看 5 件事”第 4 条） |
| `App.tsx`、`Sidebar.tsx`、`SettingsView.tsx` | 受 `.harness/ratchet.json` 棘轮，只减不增 |

- **影响**：用户可见行为；`runPublish.ts` 决定 payload 内容（与 shared 契约对齐）。
- **规则**：只用 `ui/` 组件和语义色类（不写裸 `<button>`、不写十六进制色）；跨特征岛只经 `index.ts` 导入；渲染层禁止导入 `main/**`、`electron`、`node:fs`。改 `platformSpecs.ts` 数值必须同步出处并让 `tests/platformSpecSources.test.ts` 通过。
- **必跑**：通用命令（E2E 全量）；UI 改动用 `PW_SCREENSHOT_DIR=/tmp/shots` 跑 `publish-visual.spec.ts` / `socialCards.spec.ts`，浅色 + 深色截图贴到 PR（图片推 `pr-assets` 分支）。

### 7. docs / openspec / 测试 — 风险 low

`docs/**`、`openspec/**`、`*.md`、`**/*.test.ts`、`apps/desktop/tests/**`。仍需 `pnpm harness:check`（文档死链）。

## 一个功能怎么拆 PR

按依赖方向从下往上拆，每个 PR ≤ 600 行可审改动、只落在一层，后一个以前一个为 base（合并后改 base 回 `test`）：

1. **契约**（shared，high）：只加可选字段/常量 + 注释。附：哪个后续 PR 会用到。
2. **主进程 / preload / 适配器**（high/mid）：先写失败的 node 测试，再实现；不碰界面。
3. **core**（mid）：排版/卡片逻辑 + 单测；视觉改动附样张。
4. **界面**（mid）：组件 + E2E + 浅色/深色截图。
5. **文档**（low）：CHANGE_MAP / 规则出处 / 用户说明。

小改动（单层、<300 行）可以一个 PR 完成。跨层但很小的，也至少把“契约”单独列一节说明。PR 正文固定三段：**改了什么 / 怎么验证（贴命令输出）/ 怎么回退**，并注明跑到了 L2（Mock E2E）、L3（真 Electron）还是 L4（真平台）。

## TODO（以后调）

- **审查流程**：AI 审查（`ai-review*.yml`）和风险门禁（`risk-gate.yml`）需要后续调整——大 PR 的 diff 截断、分层 PR（base 不是 `test` 时 CI 不跑）、stacked PR squash 后需要 rebase 等问题。本次**没有改 `.github/`**，需维护者解锁底座后再处理。
- **每日发布 PR 的 CI**：`[Daily Release]` PR 由 `github-actions[bot]` 用 `GITHUB_TOKEN` 创建，PR 事件不触发工作流（或停在 `action_required`），而 master 分支保护要求 `ci-gate`，导致 PR 一直 `blocked`。可选修法：用 PAT / GitHub App token 创建该 PR，或在创建后 `workflow_dispatch` 一次 CI。
- **凭据存储**：AGENTS.md 要求 `safeStorage`，但代码未使用；图床密钥在 `vcat-config.json` 明文。需要单独一个 high 风险 PR 处理。
- **AGENTS.md 与 project.json 不一致**：AGENTS.md 把 `packages/shared/` 列入底座锁，`.harness/project.json` 的 `bootstrapLockProtectedPaths` 里没有它（风险规则里它是 high）。以哪个为准需维护者决定。
