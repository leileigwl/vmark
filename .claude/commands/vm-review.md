---
description: 开 PR 前的多代理本地审核（不改代码）：并行审核 → 复核去误报 → 按严重度汇总
argument-hint: [基线分支，默认 origin/preview/latest]
---
基线：$ARGUMENTS（为空时用 `origin/preview/latest`），下面记为 BASE。

这一步**不改任何文件**，只出报告。

1. `git fetch origin`，运行 `git diff --stat BASE...HEAD`。没有改动就结束。
2. 用一句话总结这次改动做了什么。
3. **并行**启动以下子代理，每个都告诉它 BASE 是什么：
   - `bug-hunter`
   - `rules-auditor`
   - `test-auditor`
   - `data-integrity-guardian`：diff 涉及 `features/editor-ir`、`features/workspace-tree`、`main/ipc/article`、`main/index.ts`、`main/editorSafety.ts`、保存或快捷键时**必须**调用
   - `ui-reviewer`：diff 含 `apps/desktop/src/renderer/**/*.tsx` 或样式时调用
4. 把所有子代理的 JSON 合并，交给 `finding-verifier` 复核，只保留置信度 ≥ 80 的。
5. 输出报告：

```
## 审核结论：可以开 PR / 必须先改
## 🔴 必须改（N）
- 文件:行 — 问题 — 证据 — 建议
## 🟡 建议改（N）
## 🟣 旧问题（N，不在本 PR 改，已建议记入 ROADMAP）
## 门禁结果
（来自 test-auditor / data-integrity-guardian 跑出的真实输出）
```

6. 有 🔴 时问维护者：「要我按报告修吗？」得到同意后修复，修完重新跑 `/vm-verify` 和 `/vm-review`。
