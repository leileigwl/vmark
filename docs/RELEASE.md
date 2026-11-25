# RELEASE.md：发版手册（一次合并 → 自动打 tag → 三平台打包 → 安全公开）

> 给维护者和 AI 看的唯一发版说明。日常流程见 [OPERATOR_PLAYBOOK.md](OPERATOR_PLAYBOOK.md)。

## 一、整体流程

```text
功能 PR ──squash──▶ test ──(每晚 21:00 汇总 PR，维护者点 Merge commit)──▶ master
                                                                           │
            daily-release-pr.yml / post-merge-syncback  ◀──────────────────┘
              1. master 相对 test 有新内容才回同步（日常没有，不再开空 PR）
              2. release-plan.mjs next-tag origin/master 算版本
                 · 基线 = 最高正式版；feat→次版本，fix 等→补丁，BREAKING→0.x 升次版本
                 · 已有更高的 rc（v0.6.0-rc.1）→ 转正 v0.6.0
                 · HEAD 已有正式版 tag / 只有同步提交 → 不打
              3. 打 annotated tag 推到 master，workflow_dispatch 派发 release.yml
              4. always() 关闭冻结锁 Issue，test 解冻
                                                                           │
            release.yml  ◀─────────────────────────────────────────────────┘
              prepare  校验 tag；正式版必须在 master；已公开则跳过；建草稿 Release（带 - 的 tag 标 prerelease）
              verify   macOS 上 typecheck + 单测 + 构建 + Playwright
              build    mac / win / linux 三台并行打包 → release-assets check → 只上传 artifact
              publish  三平台合并检查 latest*.yml → SHA256SUMS.txt → 上传草稿 → 核对 GitHub sha256 → 公开
              失败     Release 停在草稿 + 自动开 Issue；修好后对同一 tag 重跑
```

用户和 electron-updater 只会看到**已公开**的 Release，所以半成品永远不会被自动更新拉到。

## 二、日常发版（什么都不用做）

每晚收到汇总 PR 邮件 → 真机试 3 分钟 → 点 **Create a merge commit**。之后：

- Actions 里出现 `Daily Release PR & Post-Merge Syncback`，步骤摘要写着打了哪个 tag、为什么；
- 约 15 分钟后 `Release / Package Desktop App` 完成，Releases 页面出现新版本和 `SHA256SUMS.txt`。

## 三、发预发布版（真机验证用）

```bash
git fetch origin && git checkout test && git pull
git tag -a v0.6.0-rc.1 -m "v0.6.0-rc.1 真机验证"
git push origin v0.6.0-rc.1        # 推 tag 即触发 release.yml，自动标 prerelease，不标 Latest
```

- 预发布可以打在 test 上；正式版（不带 `-`）必须在 master 上，否则 prepare 直接失败。
- 已安装正式版的用户不会自动更新到预发布（`allowPrerelease = false`）。
- 下次 test→master 合并时，自动把 `v0.6.0-rc.1` 转正为 `v0.6.0`。

## 四、手动补发 / 重跑

Actions → `Release / Package Desktop App` → **Run workflow** → `tag` 填已存在的 tag（如 `v0.6.0`）。
已公开的版本会被跳过；草稿会被重新打包并覆盖文件。

## 五、出问题怎么办

| 情况 | 处理 |
| :--- | :--- |
| 打包或检查失败 | Release 是草稿，用户无感。看自动开的 Issue 里的运行链接，修好后按「四」重跑同一 tag。 |
| 已公开的版本有严重 bug | Actions → `Release / Rollback` → 填 tag 和原因：转回草稿，上一个正式版重新成为 Latest。再修复并发更高的补丁版本（已更新的用户不会自动降级）。 |
| 打错了 tag（还没公开） | 删草稿 Release，再 `git push origin :refs/tags/vX.Y.Z` 删 tag。已公开的版本不要删 tag，用 Rollback。 |
| 冻结锁 Issue 没关 | post-merge 的关锁步骤是 `always()`；仍未关就手动关闭带 `freeze:release-window` 标签的 Issue。 |
| 回同步 PR 卡在门禁 | 只在 master 有热修复时才会开。未配置 `RELEASE_BOT_TOKEN` 时工作流会为它派发一次 CI。若之后 test 又合入了别的 PR，它会因「必须与 test 同步」变成 blocked：点 Update branch，再到 Actions → CI → Run workflow 选该分支补跑一次。 |

## 六、需要在 GitHub 设置里做的事

1. **（推荐）`RELEASE_BOT_TOKEN`**：Settings → Secrets and variables → Actions → New repository secret。
   值为只授权 `leileigwl/vmark` 的细粒度 PAT（或 GitHub App token），权限：Contents、Pull requests、Actions、Workflows 读写，有效期 1 年并设日历提醒续期。
   有它时推送 tag 和开回同步 PR 都会正常触发工作流；没有它时工作流用 `workflow_dispatch` 兜底，同样能跑通。
2. **Actions 权限**：Settings → Actions → General → Workflow permissions 选 **Read and write**，勾选 **Allow GitHub Actions to create and approve pull requests**（回同步 PR 需要）。
3. **分支保护**：`master`、`test` 保持「必须通过 `ci-gate`」；不要给 bot 开直推。tag 可加规则 `v*` 只允许维护者和 Actions 创建。

## 七、签名与公证（以后要做时）

现在三平台都不签名：macOS 首次打开要「仍要打开」，且 **macOS 自动更新要求应用已签名**，未签名时只能手动下载新版；Windows 会有 SmartScreen 提示。
启用时只改两处：`apps/desktop/package.json` 去掉 `mac.identity: null` 并加 `mac.notarize: true`；release.yml 的 Package 步骤把 `CSC_IDENTITY_AUTO_DISCOVERY` 换成下列 secret：

| secret | 用途 |
| :--- | :--- |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Developer ID Application 证书（.p12 的 base64）及密码 |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | 公证 |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Windows 代码签名证书（可选） |

## 八、本地自检

```bash
cd apps/desktop && node --experimental-strip-types --test tests/releasePlan.test.ts tests/releaseNotes.test.ts tests/releaseAssets.test.ts
node apps/desktop/scripts/release-plan.mjs next-tag origin/master   # 现在合并的话会打哪个 tag
bash scripts/ci-sim/simulate-release-publish.sh                      # 演练 publish：齐全 / 文件名带空格 / sha256 不一致
bash scripts/ci-sim/simulate-post-merge.sh                           # 演练合并后：日常 / 热修复回同步 / 重复触发
```
