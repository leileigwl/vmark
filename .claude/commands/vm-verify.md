---
description: 跑全部门禁并贴出真实输出
allowed-tools: Bash
---
依次运行，每条贴出最后的结果行（通过数 / 失败数 / exit code），任何一条失败就停下并说明：

```bash
pnpm harness:check --json
pnpm run typecheck
pnpm turbo run test
cd apps/desktop && pnpm run build
cd apps/desktop && NO_PROXY=127.0.0.1,localhost npx playwright test
cd apps/desktop && pnpm run test:smoke
```

最后输出一张表：门禁 / 结果 / 用例数 / 验证层级（node、L2 无头 Chromium + mock、L3 真 Electron）。
`test:electron-smoke` 在本机跑不起来时，明确写「L3 未跑，原因：…」，不要省略。
