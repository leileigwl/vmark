import fs from 'node:fs';
import path from 'node:path';
import { runAntiCheatChecks } from './anti-cheat.ts';
import { runArchGraphChecks } from './arch-graph.ts';
import { runRatchetAndDocChecks } from './ratchet.ts';
import { classifyRisk, parseRiskRulesYaml } from './risk-classifier.ts';
import { planSlices, validateDisjointOwnership, verifySliceExecution } from './slice-lock.ts';
import type { HarnessState, HarnessViolation, ParsedDiffFile, PhaseType } from './types.ts';
import {
  loadProjectConfig,
  loadRatchetConfig,
  loadStateConfig,
  parseUnifiedDiff,
  runGit,
  toPosixPath,
  writeJson,
} from './utils.ts';

/**
 * Collect git diff against baseRef (plus staged/unstaged/untracked local files when baseRef is HEAD).
 */
export function collectDiffContext(
  rootDir: string,
  baseRef?: string
): { diffFiles: ParsedDiffFile[]; getBaseContent: (filePath: string) => string | null } {
  const effectiveBase = baseRef && baseRef.trim() ? baseRef.trim() : 'HEAD';
  const diffRange = effectiveBase === 'HEAD' ? ['diff', '--unified=0', 'HEAD'] : ['diff', '--unified=0', `${effectiveBase}...HEAD`];
  const diffOut = runGit(diffRange, rootDir);
  const diffFiles = parseUnifiedDiff(diffOut.stdout);

  // When running locally against HEAD, also include untracked non-ignored files
  if (effectiveBase === 'HEAD') {
    const trackedPaths = new Set(diffFiles.map((d) => toPosixPath(d.file)));
    const untracked = runGit(['ls-files', '--others', '--exclude-standard'], rootDir);
    for (const rel of untracked.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
      if (trackedPaths.has(rel)) continue;
      const abs = path.join(rootDir, rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const raw = fs.readFileSync(abs, 'utf8');
      const lines = raw.split('\n');
      diffFiles.push({
        file: rel,
        isNew: true,
        isDeleted: false,
        addedLines: lines.map((content, idx) => ({ line: idx + 1, content })),
        removedLines: [],
        addedCount: lines.length,
        removedCount: 0,
      });
    }
  }

  const getBaseContent = (filePath: string): string | null => {
    const res = runGit(['show', `${effectiveBase}:${toPosixPath(filePath)}`], rootDir);
    return res.ok ? res.stdout : null;
  };

  return { diffFiles, getBaseContent };
}

/**
 * Compress violations into compact <=2KB JSON payload (`<=20` items) for small-model context budgets.
 */
export function formatCompactJsonOutput(violations: HarnessViolation[]): string {
  const MAX_ITEMS = 20;
  const MAX_BYTES = 1950;
  let cap = Math.min(violations.length, MAX_ITEMS);
  while (cap >= 0) {
    const payload = {
      ok: violations.length === 0,
      total: violations.length,
      truncated: violations.length > cap,
      violations: violations.slice(0, cap).map((v) => ({
        file: v.file,
        line: v.line,
        rule_id: v.rule_id,
        fix_hint: v.fix_hint.slice(0, 120),
      })),
    };
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_BYTES || cap === 0) {
      return serialized;
    }
    cap -= 1;
  }
  return JSON.stringify({ ok: false, total: violations.length, truncated: true, violations: [] });
}

export function runAllChecks(options: {
  rootDir: string;
  baseRef?: string;
  updateRatchet?: boolean;
}): { violations: HarnessViolation[]; ratchetDecreased: string[] } {
  const { rootDir, baseRef, updateRatchet } = options;
  const project = loadProjectConfig(rootDir);
  const ratchet = loadRatchetConfig(rootDir);
  const { diffFiles, getBaseContent } = collectDiffContext(rootDir, baseRef);

  const antiCheatViolations = runAntiCheatChecks({
    rootDir,
    project,
    diffFiles,
    getBaseContent,
  });
  const { violations: ratchetViolations, ratchetDecreased } = runRatchetAndDocChecks({
    rootDir,
    project,
    ratchet,
    updateRatchet,
  });
  const archViolations = runArchGraphChecks(rootDir, project);
  const sliceViolations = validateDisjointOwnership(rootDir, project);

  return {
    violations: [
      ...antiCheatViolations,
      ...ratchetViolations,
      ...archViolations,
      ...sliceViolations,
    ],
    ratchetDecreased,
  };
}

export function transitionPhase(options: {
  rootDir: string;
  toPhase: PhaseType;
  markGate?: keyof HarnessState['gates'];
  approvePrototype?: boolean;
}): { ok: boolean; state: HarnessState; error?: string } {
  const { rootDir, toPhase, markGate, approvePrototype } = options;
  const statePath = path.join(rootDir, '.harness/state.json');
  const state = loadStateConfig(rootDir);

  if (markGate && markGate in state.gates) {
    state.gates[markGate] = true;
  }
  if (approvePrototype) {
    state.prototypeApproved = true;
  }

  const fullOrder: PhaseType[] = [
    'SPEC',
    'PROTOTYPE_APPROVED',
    'CONTRACT_FROZEN',
    'FRONTEND_TDD',
    'BACKEND_TDD',
    'MERGE_GATE',
    'ARCHIVED',
  ];
  const fastOrder: PhaseType[] = [
    'SPEC',
    'CONTRACT_FROZEN',
    'SLICE_TDD',
    'MERGE_GATE',
    'ARCHIVED',
  ];

  const order = state.track === 'full' ? fullOrder : fastOrder;
  const curIdx = order.indexOf(state.phase);
  const targetIdx = order.indexOf(toPhase);

  if (targetIdx === -1) {
    return { ok: false, state, error: `Phase "${toPhase}" is invalid for track "${state.track}".` };
  }
  if (targetIdx !== curIdx + 1 && targetIdx !== curIdx) {
    return {
      ok: false,
      state,
      error: `Cannot skip phase from "${state.phase}" directly to "${toPhase}" on "${state.track}" track.`,
    };
  }

  if (toPhase === 'PROTOTYPE_APPROVED' && !state.gates.specValidated) {
    return { ok: false, state, error: 'Gate failed: specValidated must be true before PROTOTYPE_APPROVED.' };
  }
  if (toPhase === 'CONTRACT_FROZEN') {
    if (!state.gates.specValidated) {
      return { ok: false, state, error: 'Gate failed: specValidated must be true before CONTRACT_FROZEN.' };
    }
    if (state.track === 'full' && !state.prototypeApproved) {
      return { ok: false, state, error: 'Gate failed: prototypeApproved required on full track before CONTRACT_FROZEN.' };
    }
    state.contractFrozen = true;
  }
  if (toPhase === 'BACKEND_TDD' && (!state.gates.frontendTddPassed || !state.gates.ipcContractPassed)) {
    return {
      ok: false,
      state,
      error: 'Gate failed: frontendTddPassed and ipcContractPassed must pass before BACKEND_TDD.',
    };
  }
  if (toPhase === 'MERGE_GATE') {
    const project = loadProjectConfig(rootDir);
    const sliceIssues = validateDisjointOwnership(rootDir, project);
    if (sliceIssues.length > 0) {
      return { ok: false, state, error: `Gate failed: ${sliceIssues[0].fix_hint}` };
    }
  }

  state.phase = toPhase;
  state.updatedAt = new Date().toISOString();
  writeJson(statePath, state);
  return { ok: true, state };
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? 'check';
  const rootDir = process.cwd();
  const useJson = args.includes('--json');

  if (cmd === 'check') {
    const baseRef = getFlag(args, '--base');
    const updateRatchet = args.includes('--update-ratchet');
    const { violations, ratchetDecreased } = runAllChecks({ rootDir, baseRef, updateRatchet });
    if (useJson) {
      console.log(formatCompactJsonOutput(violations));
    } else {
      if (ratchetDecreased.length > 0) {
        console.log('Ratchet decreased candidates:', ratchetDecreased.join(', '));
      }
      if (violations.length === 0) {
        console.log('Harness check PASSED (0 violations).');
      } else {
        for (const v of violations) {
          console.error(`[${v.rule_id}] ${v.file}:${v.line} -> ${v.fix_hint}`);
        }
      }
    }
    process.exit(violations.length === 0 ? 0 : 1);
  }

  if (cmd === 'risk') {
    const baseRef = getFlag(args, '--base');
    const project = loadProjectConfig(rootDir);
    const rulesPath = path.join(rootDir, '.github/risk-rules.yml');
    const rules = fs.existsSync(rulesPath)
      ? parseRiskRulesYaml(fs.readFileSync(rulesPath, 'utf8'))
      : { max_auto_merge_lines: 300, tiers: { high: { paths: [] }, mid: { paths: [] }, low: { paths: [] } } };
    const { diffFiles, getBaseContent } = collectDiffContext(rootDir, baseRef);
    const archViolations = runArchGraphChecks(rootDir, project);
    const result = classifyRisk({ rootDir, project, rules, diffFiles, getBaseContent, archViolations });
    console.log(JSON.stringify(result, null, useJson ? 0 : 2));
    return;
  }

  if (cmd === 'transition') {
    const to = getFlag(args, '--to') as PhaseType | undefined;
    if (!to) {
      console.error('Usage: cli.ts transition --to <PHASE> [--gate <gateName>] [--prototype-approved]');
      process.exit(1);
    }
    const markGate = getFlag(args, '--gate') as keyof HarnessState['gates'] | undefined;
    const approvePrototype = args.includes('--prototype-approved');
    const res = transitionPhase({ rootDir, toPhase: to, markGate, approvePrototype });
    if (!res.ok) {
      console.error(res.error);
      process.exit(1);
    }
    console.log(`Transitioned to ${res.state.phase} (track=${res.state.track}).`);
    return;
  }

  if (cmd === 'plan-slices') {
    const rawIslands = getFlag(args, '--islands');
    const kind = (getFlag(args, '--kind') ?? 'renderer') as 'renderer' | 'main' | 'adapter';
    if (!rawIslands) {
      console.error('Usage: cli.ts plan-slices --islands <a,b> [--kind renderer|main|adapter]');
      process.exit(1);
    }
    const project = loadProjectConfig(rootDir);
    const state = loadStateConfig(rootDir);
    const res = planSlices({
      rootDir,
      project,
      state,
      islands: rawIslands.split(','),
      kind,
    });
    if (res.violations.length > 0) {
      console.error(formatCompactJsonOutput(res.violations));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, created: res.created }));
    return;
  }

  if (cmd === 'slice-verify') {
    const sliceId = getFlag(args, '--slice');
    if (!sliceId) {
      console.error('Usage: cli.ts slice-verify --slice <id> [--base <ref>] [--json]');
      process.exit(1);
    }
    const baseRef = getFlag(args, '--base');
    const { diffFiles } = collectDiffContext(rootDir, baseRef);
    const { violations: gateViolations } = runAllChecks({ rootDir, baseRef });
    const res = verifySliceExecution({ rootDir, sliceId, diffFiles, gateViolations });
    if (useJson) {
      console.log(formatCompactJsonOutput(res.violations));
    } else if (res.violations.length > 0) {
      for (const v of res.violations) {
        console.error(`[${v.rule_id}] ${v.file}:${v.line} -> ${v.fix_hint}`);
      }
      console.error(`Slice "${sliceId}" status=${res.slice.status}, retries=${res.slice.retryCount}/${res.slice.maxRetries}`);
    } else {
      console.log(`Slice "${sliceId}" verification PASSED.`);
    }
    process.exit(res.violations.length === 0 ? 0 : 1);
  }

  if (cmd === 'unlock-bootstrap') {
    const reason = getFlag(args, '--reason') ?? 'Manual architecture upgrade';
    const projPath = path.join(rootDir, '.harness/project.json');
    const project = loadProjectConfig(rootDir);
    project.bootstrapLocked = false;
    project.bootstrapUnlockReason = reason;
    writeJson(projPath, project);
    console.log(`Unlocked bootstrap protections: ${reason}`);
    return;
  }

  if (cmd === 'lock-bootstrap') {
    const projPath = path.join(rootDir, '.harness/project.json');
    const project = loadProjectConfig(rootDir);
    project.bootstrapLocked = true;
    project.bootstrapUnlockReason = null;
    writeJson(projPath, project);
    console.log('Locked bootstrap protections (`bootstrapLocked: true`).');
    return;
  }

  console.error(`Unknown harness command: ${cmd}`);
  process.exit(1);
}

const isDirectEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectEntry) {
  main();
}
