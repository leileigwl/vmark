---
name: superpowers-harness
description: Combine Superpowers design-first brainstorming and task slicing with deterministic AI Harness guardrails, shift-left design-time risk tagging, native lifecycle hooks, and risk-tiered CI/CD. Use from project inception or when starting any feature, bugfix, or concurrent multi-agent workflow.
---

# Superpowers Harness Workflow (Shift-Left Risk + Hook-Locked Concurrent TDD)

Never wait until a PR is already written to discover risk or boundary violations. Tag risk **at design time**, freeze contracts first, lock workers into disjoint physical islands, and verify through a strict 5-layer pyramid.

## Stage 1: Brainstorm & Shift-Left Risk Tagging (Before Code)

1. Clarify requirements and design tree first (use `/grill-me` or `/openspec` exploration).
2. Decompose the system or feature into vertical physical islands (`main/ipc/<domain>/`, `renderer/src/features/<domain>/`, `adapters/src/<platform>.ts`, or backend `src/routes/`, `src/services/`).
3. Before writing any implementation code, evaluate predicted risk for every design item and task using:
   ```bash
   pnpm harness:design-risk --paths "path/a,path/b" [--ast-signature-change] [--semantic-ipc] --json
   ```
4. Stamp every requirement and `tasks.md` item with its predicted badge and verification tier:
   - `[risk:low]` (docs/tests only) → `small-model`, L0 checks only.
   - `[risk:mid]` (isolated renderer UI / non-privileged module `<300` lines) → `small-model`, L0 + L1 + L2.
   - `[risk:high]` (shared contracts, Barrel signature changes, IPC/auth/SQL/process primitives, locked infrastructure, `>300` lines) → `frontier-model`, L0 + L1 + L2 + L3 + human `/approve`.

## Stage 2: Contract Freeze & Disjoint Island Slicing

1. Freeze shared types, IPC/API contracts, and test skeletons first (high-tier task), then transition state:
   ```bash
   pnpm harness:transition --to CONTRACT_FROZEN --gate specValidated
   ```
2. Generate mutually disjoint `<300`-line slice cards in `.harness/slices/` (each automatically carries `predictedRisk`, `riskReasons`, and `assigneeTier`):
   ```bash
   pnpm harness:plan-slices --islands <domain1,domain2> --kind <renderer|main|adapter>
   ```

## Stage 3: Hook-Locked Concurrent TDD & 2-Strike Circuit Breaker

1. Dispatch parallel workers in separate `git worktree` checkouts (dynamic ephemeral Playwright ports + isolated temp dirs).
2. Rely on native `.agents/hooks.json` / `.claude/settings.json` + `.githooks/` (`hook-adapter.ts`):
   - `SessionStart`: injects phase, `bootstrapLocked`, active `ownedPaths`, and pending GitHub issues/PRs.
   - `PreToolUse`: physically blocks edits outside `ownedPaths` or into locked infrastructure (`bootstrapLocked: true`) and blocks `npm`/`yarn`/`--force`/`--no-verify`.
   - `PostToolUse` & `Stop`: forces compact `{file, line, rule_id, fix_hint}` error feedback (`<2KB`) and refuses premature completion until `pnpm harness:check` passes.
3. Verify slice execution with `pnpm harness:slice-verify --slice <id>`. After **2 consecutive failures**, status flips to `escalated` so a frontier model or maintainer takes over instead of churning.

## Stage 4: Risk-Tiered CI/CD & Single-Window Email Loop

1. Push slice branches as PRs targeting `test`. GitHub Actions runs parallel `ubuntu-latest` L0/L1/L2 sharded verification (plus L3 `xvfb-run` when `high` or merging to `test`).
2. `risk:low` and `risk:mid` trusted PRs auto-squash into `test`; `risk:high` pauses for explicit `@owner` `/approve` comment.
3. At 21:00 CST, `daily-release-pr` opens a `test -> master` summary PR with the 5 daily KPIs and `@owner` email notification. Weekly `slop-audit` files a classified 5-category debt issue with disjoint cleanup slices.

## Porting to Any New Project

Bootstrap any new Electron desktop or backend web service repository with:
```bash
pnpm harness:init-project --target <dir> --profile <desktop-electron|web-service> --project-id <name> --owner <github-user>
```
Or export a standalone public Skill repository bundle via:
```bash
pnpm harness:export-skill --out dist/superpowers-harness-skill
```
