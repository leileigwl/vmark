import fs from 'node:fs';
import path from 'node:path';
import { scanSourceAntiCheat } from './anti-cheat.ts';
import { formatCompactJsonOutput, runAllChecks } from './cli.ts';
import { loadActiveSlices } from './slice-lock.ts';
import type { HarnessSlice, HarnessViolation } from './types.ts';
import {
  countFileLines,
  loadProjectConfig,
  loadRatchetConfig,
  loadStateConfig,
  matchesAnyGlob,
  runGit,
  toPosixPath,
  writeJson,
} from './utils.ts';

export interface HookPayload {
  cwd?: string;
  workspacePaths?: string[];
  modelName?: string;
  continuationActive?: boolean;
  terminationReason?: string;
  toolCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
  // Claude Code hook compatibility fields
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  stop_hook_active?: boolean;
}

function getActiveSliceForContext(rootDir: string): HarnessSlice | null {
  const slices = loadActiveSlices(rootDir);
  if (slices.length === 0) return null;
  const envSliceId = process.env.HARNESS_ACTIVE_SLICE?.trim();
  if (envSliceId) {
    return slices.find((s) => s.sliceId === envSliceId) ?? null;
  }
  const branch = runGit(['branch', '--show-current'], rootDir).stdout.trim();
  if (branch) {
    const byBranch = slices.find((s) => s.worktreeBranch === branch);
    if (byBranch) return byBranch;
  }
  return slices.length === 1 ? slices[0] : null;
}

function extractTargetPath(args: Record<string, unknown> | undefined, rootDir: string): string | null {
  if (!args) return null;
  const raw =
    (args.Path as string | undefined) ??
    (args.path as string | undefined) ??
    (args.file_path as string | undefined) ??
    (args.target_file as string | undefined);
  return typeof raw === 'string' && raw.trim() ? toPosixPath(raw.trim(), rootDir) : null;
}

function extractCommandLine(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  const raw = (args.CommandLine as string | undefined) ?? (args.command as string | undefined) ?? '';
  return typeof raw === 'string' ? raw : '';
}

function isSourceImplementationFile(relPath: string): boolean {
  return (
    (relPath.startsWith('apps/desktop/src/') || relPath.startsWith('packages/')) &&
    /\.[cm]?[jt]sx?$/.test(relPath) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(relPath)
  );
}

/**
 * Evaluate native agent lifecycle events (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`) deterministically.
 */
export function evaluateHookEvent(options: {
  rootDir: string;
  event: 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop';
  runtime?: 'antigravity' | 'claude';
  payload: HookPayload;
}): Record<string, unknown> {
  const { rootDir, event, runtime = 'antigravity', payload } = options;
  const project = loadProjectConfig(rootDir);
  const state = loadStateConfig(rootDir);
  const activeSlice = getActiveSliceForContext(rootDir);

  if (event === 'SessionStart') {
    const lockLabel = project.bootstrapLocked ? 'LOCKED (仅限业务模块岛改动)' : 'UNLOCKED (Stage A 底座建设中)';
    const sliceSummary = activeSlice
      ? `activeSlice=${activeSlice.sliceId} status=${activeSlice.status} retries=${activeSlice.retryCount}/${activeSlice.maxRetries}`
      : 'activeSlice=none';
    const msg = `[Harness SessionStart] project=${project.projectId} track=${state.track} phase=${state.phase} contractFrozen=${state.contractFrozen} bootstrap=${lockLabel} ${sliceSummary}. Always run \`pnpm harness:check --json\` before finishing.`;
    return {
      injectSteps: [{ systemMessage: { systemMessage: msg } }],
    };
  }

  if (event === 'PreToolUse') {
    const toolName = payload.toolCall?.name ?? payload.tool_name ?? '';
    const args = payload.toolCall?.args ?? payload.tool_input ?? {};

    const deny = (reason: string): Record<string, unknown> => {
      if (runtime === 'claude') {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        };
      }
      return { decision: 'deny', reason };
    };

    if (/^(edit_file|write_file|Edit|Write|MultiEdit)$/.test(toolName)) {
      const targetPath = extractTargetPath(args, rootDir);
      if (targetPath) {
        if (project.bootstrapLocked && matchesAnyGlob(targetPath, project.bootstrapLockProtectedPaths)) {
          return deny(
            `BOOTSTRAP_LOCKED: \`${targetPath}\` belongs to locked core infrastructure. Run \`pnpm harness:unlock-bootstrap\` before modifying harness/CI/docs contracts.`
          );
        }

        if (activeSlice) {
          if (activeSlice.status === 'escalated') {
            return deny(
              `SLICE_ESCALATED: Slice "${activeSlice.sliceId}" exceeded max retries (${activeSlice.retryCount}/${activeSlice.maxRetries}). Wait for Frontier AI / human takeover.`
            );
          }
          if (targetPath !== `.harness/slices/${activeSlice.sliceId}.json`) {
            if (matchesAnyGlob(targetPath, activeSlice.forbiddenPaths) || !matchesAnyGlob(targetPath, activeSlice.ownedPaths)) {
              return deny(
                `SLICE_BOUNDARY: \`${targetPath}\` is outside active slice "${activeSlice.sliceId}" ownedPaths.`
              );
            }
          }
        }

        if (project.bootstrapLocked && !state.contractFrozen && isSourceImplementationFile(targetPath)) {
          return deny(
            `STATE_LOCK: Current phase is \`${state.phase}\` (contractFrozen=false). Complete OpenSpec & contract freeze before editing \`${targetPath}\`.`
          );
        }
      }
    }

    if (/^(run_command|Bash)$/.test(toolName)) {
      const cmdLine = extractCommandLine(args);
      if (/\b(?:npm\s+(?:install|i|add|run)|yarn\s+(?:add|install|run))\b/.test(cmdLine)) {
        return deny('COMMAND_GUARD: Monorepo requires `pnpm` only; `npm`/`yarn` invocations are blocked.');
      }
      if (/git\s+push\b[^\n]*(?:--force|\s-f\b)/.test(cmdLine)) {
        return deny('COMMAND_GUARD: Force pushing is blocked by repository safety harness.');
      }
      if (/git\s+(?:commit|push)\b[^\n]*--no-verify\b/.test(cmdLine)) {
        return deny('COMMAND_GUARD: Bypassing git hooks with `--no-verify` is strictly prohibited.');
      }
    }

    return runtime === 'claude' ? {} : { decision: 'allow' };
  }

  if (event === 'PostToolUse') {
    const toolName = payload.toolCall?.name ?? payload.tool_name ?? '';
    const args = payload.toolCall?.args ?? payload.tool_input ?? {};
    if (/^(edit_file|write_file|Edit|Write|MultiEdit)$/.test(toolName)) {
      const targetPath = extractTargetPath(args, rootDir);
      if (targetPath && /\.[cm]?[jt]sx?$/.test(targetPath)) {
        const abs = path.join(rootDir, targetPath);
        if (fs.existsSync(abs)) {
          const text = fs.readFileSync(abs, 'utf8');
          const ratchet = loadRatchetConfig(rootDir);
          const violations: HarnessViolation[] = scanSourceAntiCheat(targetPath, text, new Set());
          const lines = countFileLines(abs);
          const entry = ratchet.files[targetPath];
          if (entry && lines > entry.maxLines) {
            violations.push({
              file: targetPath,
              line: lines,
              rule_id: 'RATCHET_FILE_GREW',
              fix_hint: `Lines (${lines}) exceeded ratchet (${entry.maxLines}). Split module instead.`,
            });
          } else if (!entry && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(targetPath) && lines > ratchet.defaultNewFileMaxLines) {
            violations.push({
              file: targetPath,
              line: lines,
              rule_id: 'RATCHET_NEW_FILE_TOO_LARGE',
              fix_hint: `File exceeds ${ratchet.defaultNewFileMaxLines} lines.`,
            });
          }
          if (violations.length > 0) {
            writeJson(path.join(rootDir, '.harness/.last-violations.json'), {
              updatedAt: new Date().toISOString(),
              violations,
            });
          }
        }
      }
    }
    return {};
  }

  // Stop hook
  const isContinuing = Boolean(payload.continuationActive ?? payload.stop_hook_active);
  const termReason = payload.terminationReason ?? 'NO_TOOL_CALL';
  if (isContinuing || termReason !== 'NO_TOOL_CALL') {
    return {};
  }
  // Stage A bootstrap mode without an active slice lets operator/planner iterate cleanly without looping
  if (!project.bootstrapLocked && !activeSlice) {
    return {};
  }
  if (activeSlice && activeSlice.status === 'escalated') {
    return {};
  }

  const { violations } = runAllChecks({ rootDir });
  if (violations.length > 0) {
    const reasonJson = formatCompactJsonOutput(violations);
    return {
      decision: 'continue',
      reason: `Harness gate failed; resolve these violations before stopping: ${reasonJson}`,
    };
  }
  return {};
}

function findHarnessRootFrom(startDir: string): string | null {
  let cur = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(cur, '.harness/project.json'))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function resolveRepoRoot(payload: HookPayload): string {
  if (payload.cwd) {
    const found = findHarnessRootFrom(payload.cwd);
    if (found) return found;
  }
  for (const ws of payload.workspacePaths ?? []) {
    const found = findHarnessRootFrom(ws);
    if (found) return found;
  }
  const scriptRelativeRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  if (fs.existsSync(path.join(scriptRelativeRoot, '.harness/project.json'))) {
    return scriptRelativeRoot;
  }
  return findHarnessRootFrom(process.cwd()) ?? process.cwd();
}

function main(): void {
  const args = process.argv.slice(2);
  const evIdx = args.indexOf('--event');
  const event = (evIdx !== -1 ? args[evIdx + 1] : undefined) as
    | 'SessionStart'
    | 'PreToolUse'
    | 'PostToolUse'
    | 'Stop'
    | undefined;
  const rtIdx = args.indexOf('--runtime');
  const runtime = (rtIdx !== -1 ? args[rtIdx + 1] : 'antigravity') as 'antigravity' | 'claude';

  if (!event) {
    console.error('Usage: hook-adapter.ts --event SessionStart|PreToolUse|PostToolUse|Stop [--runtime antigravity|claude]');
    process.exit(1);
  }

  let rawStdin = '';
  try {
    rawStdin = fs.readFileSync(0, 'utf8');
  } catch {
    rawStdin = '';
  }
  let payload: HookPayload = {};
  if (rawStdin.trim()) {
    try {
      payload = JSON.parse(rawStdin) as HookPayload;
    } catch {
      payload = {};
    }
  }

  const rootDir = resolveRepoRoot(payload);
  const out = evaluateHookEvent({ rootDir, event, runtime, payload });
  console.log(JSON.stringify(out));
}

const isDirectEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectEntry) {
  main();
}
