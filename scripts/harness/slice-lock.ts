import fs from 'node:fs';
import path from 'node:path';
import type {
  HarnessProjectConfig,
  HarnessSlice,
  HarnessState,
  HarnessViolation,
  ParsedDiffFile,
} from './types.ts';
import { globsIntersect, matchesAnyGlob, readJson, toPosixPath, writeJson } from './utils.ts';

export function loadActiveSlices(rootDir: string): HarnessSlice[] {
  const dir = path.join(rootDir, '.harness/slices');
  if (!fs.existsSync(dir)) return [];
  const slices: HarnessSlice[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const slice = readJson<HarnessSlice>(path.join(dir, name));
    if (slice.status !== 'merged' && slice.status !== 'archived') {
      slices.push(slice);
    }
  }
  return slices;
}

/**
 * Validate pairwise disjointness of `ownedPaths` across active slices and diff line limits.
 */
export function validateDisjointOwnership(
  rootDir: string,
  project: HarnessProjectConfig
): HarnessViolation[] {
  const slices = loadActiveSlices(rootDir);
  const violations: HarnessViolation[] = [];

  for (let i = 0; i < slices.length; i += 1) {
    const a = slices[i];
    if (a.maxDiffLines > project.limits.sliceMaxDiffLines) {
      violations.push({
        file: `.harness/slices/${a.sliceId}.json`,
        line: 1,
        rule_id: 'SLICE_MAX_DIFF_EXCEEDED',
        fix_hint: `Slice maxDiffLines (${a.maxDiffLines}) exceeds project limit (${project.limits.sliceMaxDiffLines}).`,
      });
    }
    for (let j = i + 1; j < slices.length; j += 1) {
      const b = slices[j];
      if (globsIntersect(a.ownedPaths, b.ownedPaths)) {
        violations.push({
          file: `.harness/slices/${b.sliceId}.json`,
          line: 1,
          rule_id: 'SLICE_OWNERSHIP_OVERLAP',
          fix_hint: `Slice "${b.sliceId}" ownedPaths overlaps with "${a.sliceId}". Narrow ownedPaths to disjoint islands.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Deterministically generate disjoint `.harness/slices/<id>.json` cards per vertical island.
 */
export function planSlices(options: {
  rootDir: string;
  project: HarnessProjectConfig;
  state: HarnessState;
  islands: string[];
  kind: 'renderer' | 'main' | 'adapter';
  assigneeTier?: 'small-model' | 'frontier-model';
}): { created: string[]; violations: HarnessViolation[] } {
  const { rootDir, project, state, islands, kind, assigneeTier = 'small-model' } = options;
  if (!state.contractFrozen) {
    return {
      created: [],
      violations: [
        {
          file: '.harness/state.json',
          line: 1,
          rule_id: 'CONTRACT_NOT_FROZEN',
          fix_hint: 'Transition state to CONTRACT_FROZEN before planning concurrent slices.',
        },
      ],
    };
  }

  const created: string[] = [];
  const defaultForbidden = [...project.bootstrapLockProtectedPaths, 'packages/shared/**'];
  const existing = loadActiveSlices(rootDir);

  for (const rawIsland of islands) {
    const island = rawIsland.trim();
    if (!island) continue;
    const sliceId = `${kind}-${island}`;
    let ownedPaths: string[];
    let requiredChecks: Array<'L0' | 'L1' | 'L2' | 'L3'>;

    if (kind === 'renderer') {
      const base = project.moduleIslands?.rendererRoot ?? 'apps/desktop/src/renderer/src/features';
      ownedPaths = [`${base}/${island}/**`, `apps/desktop/tests/${island}.spec.ts`];
      requiredChecks = ['L0', 'L1', 'L2'];
    } else if (kind === 'main') {
      const base = project.moduleIslands?.mainIpcRoot ?? 'apps/desktop/src/main/ipc';
      ownedPaths = [`${base}/${island}/**`];
      requiredChecks = ['L0', 'L1', 'L3'];
    } else {
      ownedPaths = [
        `packages/adapters/src/${island}.ts`,
        `packages/adapters/src/${island}.test.ts`,
      ];
      requiredChecks = ['L0', 'L1'];
    }

    // Check overlap against existing active slices and already planned ones
    const overlapWith = existing.find((s) => s.sliceId !== sliceId && globsIntersect(s.ownedPaths, ownedPaths));
    if (overlapWith) {
      return {
        created,
        violations: [
          {
            file: `.harness/slices/${sliceId}.json`,
            line: 1,
            rule_id: 'SLICE_OWNERSHIP_OVERLAP',
            fix_hint: `Planned slice "${sliceId}" overlaps existing slice "${overlapWith.sliceId}".`,
          },
        ],
      };
    }

    const slice: HarnessSlice = {
      sliceId,
      changeName: state.changeName,
      assigneeTier,
      worktreeBranch: `slice/${sliceId}`,
      status: 'pending',
      retryCount: 0,
      maxRetries: project.limits.circuitBreakerMaxRetries,
      maxDiffLines: project.limits.sliceMaxDiffLines,
      ownedPaths,
      forbiddenPaths: defaultForbidden,
      requiredChecks,
      lastFailureSummary: null,
    };
    const outPath = path.join(rootDir, `.harness/slices/${sliceId}.json`);
    writeJson(outPath, slice);
    existing.push(slice);
    created.push(toPosixPath(outPath, rootDir));
  }

  return { created, violations: [] };
}

/**
 * Verify a single slice's boundaries, diff size, and 2-failure circuit breaker state.
 */
export function verifySliceExecution(options: {
  rootDir: string;
  sliceId: string;
  diffFiles: ParsedDiffFile[];
  gateViolations: HarnessViolation[];
}): { slice: HarnessSlice; violations: HarnessViolation[] } {
  const { rootDir, sliceId, diffFiles, gateViolations } = options;
  const slicePath = path.join(rootDir, `.harness/slices/${sliceId}.json`);
  const slice = readJson<HarnessSlice>(slicePath);

  if (slice.status === 'escalated' || slice.retryCount >= slice.maxRetries) {
    slice.status = 'escalated';
    writeJson(slicePath, slice);
    return {
      slice,
      violations: [
        {
          file: `.harness/slices/${sliceId}.json`,
          line: 1,
          rule_id: 'SLICE_ESCALATED_CIRCUIT_OPEN',
          fix_hint: `Slice "${sliceId}" hit ${slice.retryCount}/${slice.maxRetries} consecutive failures and is locked for Frontier AI / human takeover.`,
        },
      ],
    };
  }

  const violations: HarnessViolation[] = [...gateViolations];
  let totalLines = 0;

  for (const diff of diffFiles) {
    const rel = toPosixPath(diff.file);
    if (rel === `.harness/slices/${sliceId}.json`) continue;
    totalLines += diff.addedCount + diff.removedCount;

    if (matchesAnyGlob(rel, slice.forbiddenPaths)) {
      violations.push({
        file: rel,
        line: 1,
        rule_id: 'SLICE_FORBIDDEN_PATH',
        fix_hint: `Path \`${rel}\` is explicitly forbidden for slice "${sliceId}". Revert changes here.`,
      });
    } else if (!matchesAnyGlob(rel, slice.ownedPaths)) {
      violations.push({
        file: rel,
        line: 1,
        rule_id: 'SLICE_OUT_OF_OWNED_PATHS',
        fix_hint: `Path \`${rel}\` is outside slice "${sliceId}" ownedPaths. Revert or request re-slicing.`,
      });
    }
  }

  if (totalLines > slice.maxDiffLines) {
    violations.push({
      file: `.harness/slices/${sliceId}.json`,
      line: 1,
      rule_id: 'SLICE_DIFF_TOO_LARGE',
      fix_hint: `Diff has ${totalLines} lines (slice limit: ${slice.maxDiffLines}). Split into smaller slices.`,
    });
  }

  if (violations.length > 0) {
    slice.retryCount += 1;
    slice.lastFailureSummary = violations
      .slice(0, 3)
      .map((v) => `${v.rule_id}@${v.file}:${v.line}`)
      .join('; ');
    if (slice.retryCount >= slice.maxRetries) {
      slice.status = 'escalated';
    }
    writeJson(slicePath, slice);
  } else {
    slice.lastFailureSummary = null;
    if (slice.status === 'pending') slice.status = 'in_progress';
    writeJson(slicePath, slice);
  }

  return { slice, violations };
}
