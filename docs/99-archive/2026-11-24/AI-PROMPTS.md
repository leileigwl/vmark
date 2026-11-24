# AI-PROMPTS.md：给 Claude Code 的常用提示词

复制整段发给 Claude Code。命令（`/vm-…`）定义在 `.claude/commands/`，流程见 `CLAUDE.md`。

## 1. 每次开新会话

```
仓库 leileigwl/vmark，切到 preview/latest 并拉最新。
先读 CLAUDE.md、REVIEW.md、docs/session-handoff.md、docs/ROADMAP-AI.md。
读完用五行以内告诉我：当前进度、未合并的 PR、等我决定的事、建议下一个任务。不要改任何文件。
```

## 2. 挑下一个任务

```
/vm-next
```

## 3. 做路线图上的某个任务

```
/vm-plan T3
```
看完计划，同意就回：
```
开始。按计划 /vm-build T3，完成后 /vm-verify，再 /vm-review。有 🔴 先告诉我，不要自己开 PR。
```

## 4. 我真机测试发现了问题

```
/vm-bug 在 macOS 上打开发布弹窗，点「全选可推送」后公众号没被勾上。公众号显示已登录。截图在 ~/Desktop/a.png。
```
（写清：系统、哪个界面、做了什么、期望什么、实际什么；有截图、日志、页面 HTML 片段就给路径。）

## 5. 平台规则核实结果

```
我在公众号后台核实了：标题最多 64 个汉字，输入第 65 个时计数器变红且保存报错。
按 docs/ROADMAP-AI.md 的 T7，把公众号的这一项移到 SPEC_EVIDENCE（后台位置：内容管理 → 草稿箱 → 新建图文，核实日期今天），
如果公众号的待核实项已经全部确认就改 verified:true。走 /vm-plan → /vm-build → /vm-verify → /vm-review。
```

## 6. 开 PR 前单独审核

```
/vm-review
```
只想快速看一处：
```
用 data-integrity-guardian 审一下当前分支相对 origin/preview/latest 的改动，只出报告不改代码。
```

## 7. 审核通过，开 PR

```
/vm-ship
```

## 8. 卡住了 / 测试一直不过

```
停一下。不要再改代码。
告诉我：哪个门禁没过、完整报错、你试过什么、你认为的根因、两个可选方案各自的风险。
```

## 9. 收工

```
/vm-handoff
然后用十行以内告诉我：今天合进去了什么、还开着的 draft PR、明天建议先做什么、需要我真机确认的清单。
```

## 10. 大功能（新平台、改数据结构）

```
这是一个大改动：<需求>。
先不要写代码。按 openspec 写 openspec/changes/<名字>/ 的 proposal.md、design.md、tasks.md，
tasks 里每一项都要能独立成一个 ≤600 行的 PR，并标明哪些要改 packages/shared（需要我同意）。写完给我看。
```
