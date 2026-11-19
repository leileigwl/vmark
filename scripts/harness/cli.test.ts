import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatCompactJsonOutput, transitionPhase } from './cli.ts';
import { assessDesignRisk, parseRiskRulesYaml } from './risk-classifier.ts';
import { planSlices, validateDisjointOwnership, verifySliceExecution } from './slice-lock.ts';
import type { HarnessProjectConfig, HarnessSlice, HarnessState, HarnessViolation } from './types.ts';
import { writeJson } from './utils.ts';

function setupTempHarnessRepo(track: 'full' | 'fast' = 'full'): {
  tmpDir: string;
  project: HarnessProjectConfig;
  state: HarnessState;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-'));
  const project: HarnessProjectConfig = {
    projectId: 'vmark',
    profile: 'desktop-electron',
    owner: 'leileigwl',
    bootstrapLocked: false,
    bootstrapLockProtectedPaths: ['.harness/**', '.github/**'],
    limits: {
      newFileMaxLines: 500,
      sliceMaxDiffLines: 300,
      agentsMdMaxLines: 100,
      handoffMaxLines: 120,
      circuitBreakerMaxRetries: 2,
    },
    moduleIslands: {
      rendererRoot: 'apps/desktop/src/renderer/src/features',
      mainIpcRoot: 'apps/desktop/src/main/ipc',
      barrelFile: 'index.ts',
    },
    layerBoundaries: [],
    commands: {},
  };
  const state: HarnessState = {
    changeName: 'demo-change',
    track,
    phase: 'SPEC',
    prototypeApproved: false,
    contractFrozen: false,
    activeFreezeLock: false,
    gates: {
      specValidated: false,
      frontendTddPassed: false,
      ipcContractPassed: false,
      backendTddPassed: false,
    },
    updatedAt: new Date().toISOString(),
  };

  writeJson(path.join(tmpDir, '.harness/project.json'), project);
  writeJson(path.join(tmpDir, '.harness/state.json'), state);
  fs.mkdirSync(path.join(tmpDir, '.harness/slices'), { recursive: true });
  return { tmpDir, project, state };
}

test('state machine blocks illegal phase skip and enforces prototype + frontend-before-backend on full track', () => {
  const { tmpDir } = setupTempHarnessRepo('full');
  try {
    // Attempt skip SPEC -> CONTRACT_FROZEN without prototype
    const badSkip = transitionPhase({ rootDir: tmpDir, toPhase: 'CONTRACT_FROZEN', markGate: 'specValidated' });
    assert.equal(badSkip.ok, false);

    // Valid transition SPEC -> PROTOTYPE_APPROVED
    const step1 = transitionPhase({ rootDir: tmpDir, toPhase: 'PROTOTYPE_APPROVED', markGate: 'specValidated' });
    assert.equal(step1.ok, true);

    // Attempt CONTRACT_FROZEN without prototypeApproved
    const noProto = transitionPhase({ rootDir: tmpDir, toPhase: 'CONTRACT_FROZEN' });
    assert.equal(noProto.ok, false);

    // Approve prototype -> CONTRACT_FROZEN -> FRONTEND_TDD
    const step2 = transitionPhase({ rootDir: tmpDir, toPhase: 'CONTRACT_FROZEN', approvePrototype: true });
    assert.equal(step2.ok, true);
    assert.equal(step2.state.contractFrozen, true);

    const step3 = transitionPhase({ rootDir: tmpDir, toPhase: 'FRONTEND_TDD' });
    assert.equal(step3.ok, true);

    // Attempt BACKEND_TDD before frontend & IPC contract pass
    const noFe = transitionPhase({ rootDir: tmpDir, toPhase: 'BACKEND_TDD' });
    assert.equal(noFe.ok, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('planSlices creates disjoint slices, rejects overlaps, and triggers 2-failure escalated circuit breaker', () => {
  const { tmpDir, project, state } = setupTempHarnessRepo('fast');
  try {
    state.contractFrozen = true;
    writeJson(path.join(tmpDir, '.harness/state.json'), state);

    const planRes = planSlices({
      rootDir: tmpDir,
      project,
      state,
      islands: ['auth', 'publish'],
      kind: 'renderer',
    });
    assert.equal(planRes.violations.length, 0);
    assert.equal(planRes.created.length, 2);
    assert.equal(validateDisjointOwnership(tmpDir, project).length, 0);

    // Inject overlapping slice manually and verify validateDisjointOwnership blocks it
    writeJson(path.join(tmpDir, '.harness/slices/overlap.json'), {
      sliceId: 'overlap',
      changeName: 'demo-change',
      assigneeTier: 'small-model',
      worktreeBranch: 'slice/overlap',
      status: 'in_progress',
      retryCount: 0,
      maxRetries: 2,
      maxDiffLines: 300,
      ownedPaths: ['apps/desktop/src/renderer/src/features/auth/index.ts'],
      forbiddenPaths: [],
      requiredChecks: ['L0'],
      lastFailureSummary: null,
    });
    const overlapViolations = validateDisjointOwnership(tmpDir, project);
    assert.ok(overlapViolations.some((v) => v.rule_id === 'SLICE_OWNERSHIP_OVERLAP'));

    // Verify 2-failure circuit breaker sets status = escalated
    fs.rmSync(path.join(tmpDir, '.harness/slices/overlap.json'));
    const outOfBoundsDiff = [
      { file: 'apps/desktop/src/main/index.ts', isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 2, removedCount: 0 },
    ];
    const fail1 = verifySliceExecution({ rootDir: tmpDir, sliceId: 'renderer-auth', diffFiles: outOfBoundsDiff, gateViolations: [] });
    assert.equal(fail1.slice.retryCount, 1);
    assert.equal(fail1.slice.status, 'pending');

    const fail2 = verifySliceExecution({ rootDir: tmpDir, sliceId: 'renderer-auth', diffFiles: outOfBoundsDiff, gateViolations: [] });
    assert.equal(fail2.slice.retryCount, 2);
    assert.equal(fail2.slice.status, 'escalated');

    // Subsequent verification rejects while escalated
    const fail3 = verifySliceExecution({ rootDir: tmpDir, sliceId: 'renderer-auth', diffFiles: [], gateViolations: [] });
    assert.ok(fail3.violations.some((v) => v.rule_id === 'SLICE_ESCALATED_CIRCUIT_OPEN'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('formatCompactJsonOutput caps output under 2KB and max 20 violations for small-model context budget', () => {
  const many: HarnessViolation[] = Array.from({ length: 45 }, (_, idx) => ({
    file: `apps/desktop/src/renderer/src/features/demo/file${idx}.ts`,
    line: idx + 1,
    rule_id: 'RATCHET_TEST',
    fix_hint: 'Very long explanation '.repeat(8),
  }));
  const output = formatCompactJsonOutput(many);
  assert.ok(Buffer.byteLength(output, 'utf8') <= 1950, `Expected <= 1950 bytes, got ${Buffer.byteLength(output, 'utf8')}`);
  const parsed = JSON.parse(output) as { total: number; truncated: boolean; violations: unknown[] };
  assert.equal(parsed.total, 45);
  assert.equal(parsed.truncated, true);
  assert.ok(parsed.violations.length <= 20);
});

test('shift-left design-risk & planSlices assign predictedRisk and route high-risk islands to frontier-model', () => {
  const { tmpDir, project, state } = setupTempHarnessRepo('fast');
  try {
    state.contractFrozen = true;
    writeJson(path.join(tmpDir, '.harness/state.json'), state);
    const rulesYaml = [
      'max_auto_merge_lines: 300',
      'tiers:',
      '  high:',
      '    paths:',
      '      - "apps/desktop/src/main/**"',
      '  mid:',
      '    paths:',
      '      - "apps/desktop/src/renderer/**"',
      '  low:',
      '    paths:',
      '      - "docs/**"',
    ].join('\n');
    fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.github/risk-rules.yml'), rulesYaml, 'utf8');
    const rules = parseRiskRulesYaml(rulesYaml);

    const lowDesign = assessDesignRisk({ project, rules, paths: ['docs/guide.md'] });
    assert.equal(lowDesign.level, 'low');
    assert.equal(lowDesign.badge, '[risk:low]');
    assert.deepEqual(lowDesign.requiredChecks, ['L0']);
    assert.equal(lowDesign.recommendedAssigneeTier, 'small-model');

    const astEscalated = assessDesignRisk({
      project,
      rules,
      paths: ['apps/desktop/src/renderer/src/features/publish/index.ts'],
      touchesContractOrBarrel: true,
    });
    assert.equal(astEscalated.level, 'high');
    assert.equal(astEscalated.recommendedAssigneeTier, 'frontier-model');

    const planned = planSlices({ rootDir: tmpDir, project, state, islands: ['auth'], kind: 'main' });
    assert.equal(planned.violations.length, 0);
    const slice = JSON.parse(fs.readFileSync(path.join(tmpDir, planned.created[0]), 'utf8')) as HarnessSlice;
    assert.equal(slice.predictedRisk, 'high');
    assert.equal(slice.assigneeTier, 'frontier-model');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
