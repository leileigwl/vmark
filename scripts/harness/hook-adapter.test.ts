import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateHookEvent } from './hook-adapter.ts';
import type { HarnessProjectConfig, HarnessState, RatchetConfig } from './types.ts';
import { writeJson } from './utils.ts';

function setupHookWorkspace(options: { bootstrapLocked: boolean; contractFrozen: boolean }): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hook-'));
  const project: HarnessProjectConfig = {
    projectId: 'vmark',
    profile: 'desktop-electron',
    owner: 'leileigwl',
    bootstrapLocked: options.bootstrapLocked,
    bootstrapLockProtectedPaths: ['.harness/**', '.github/**', '.agents/hooks.json', 'AGENTS.md'],
    limits: {
      newFileMaxLines: 500,
      sliceMaxDiffLines: 300,
      agentsMdMaxLines: 100,
      handoffMaxLines: 120,
      circuitBreakerMaxRetries: 2,
    },
    layerBoundaries: [],
    commands: {},
  };
  const state: HarnessState = {
    changeName: 'hook-test',
    track: 'fast',
    phase: options.contractFrozen ? 'SLICE_TDD' : 'SPEC',
    prototypeApproved: false,
    contractFrozen: options.contractFrozen,
    activeFreezeLock: false,
    gates: {
      specValidated: true,
      frontendTddPassed: false,
      ipcContractPassed: false,
      backendTddPassed: false,
    },
    updatedAt: new Date().toISOString(),
  };
  const ratchet: RatchetConfig = { defaultNewFileMaxLines: 500, files: {} };

  writeJson(path.join(tmpDir, '.harness/project.json'), project);
  writeJson(path.join(tmpDir, '.harness/state.json'), state);
  writeJson(path.join(tmpDir, '.harness/ratchet.json'), ratchet);
  fs.mkdirSync(path.join(tmpDir, '.harness/slices'), { recursive: true });
  return tmpDir;
}

test('hook-adapter blocks small model from editing locked framework files & out-of-bounds slice paths', () => {
  const tmpDir = setupHookWorkspace({ bootstrapLocked: true, contractFrozen: true });
  try {
    writeJson(path.join(tmpDir, '.harness/slices/ui-theme.json'), {
      sliceId: 'ui-theme',
      changeName: 'hook-test',
      assigneeTier: 'small-model',
      worktreeBranch: 'slice/ui-theme',
      status: 'in_progress',
      retryCount: 0,
      maxRetries: 2,
      maxDiffLines: 300,
      ownedPaths: ['apps/desktop/src/renderer/src/features/theme/**'],
      forbiddenPaths: ['.github/**'],
      requiredChecks: ['L0'],
      lastFailureSummary: null,
    });

    // Simulate Gemini 3.8 Flash attempting to modify risk rules when locked
    const denyLocked = evaluateHookEvent({
      rootDir: tmpDir,
      event: 'PreToolUse',
      payload: {
        modelName: 'gemini-3.8-flash',
        toolCall: { name: 'edit_file', args: { Path: '.github/risk-rules.yml' } },
      },
    });
    assert.equal(denyLocked.decision, 'deny');
    assert.match(String(denyLocked.reason), /BOOTSTRAP_LOCKED/);

    // Simulate editing outside slice ownedPaths
    const denySlice = evaluateHookEvent({
      rootDir: tmpDir,
      event: 'PreToolUse',
      payload: {
        toolCall: { name: 'write_file', args: { Path: 'apps/desktop/src/main/index.ts' } },
      },
    });
    assert.equal(denySlice.decision, 'deny');
    assert.match(String(denySlice.reason), /SLICE_BOUNDARY/);

    // Allowed edit inside ownedPaths
    const allowOwned = evaluateHookEvent({
      rootDir: tmpDir,
      event: 'PreToolUse',
      payload: {
        toolCall: { name: 'edit_file', args: { Path: 'apps/desktop/src/renderer/src/features/theme/index.ts' } },
      },
    });
    assert.equal(allowOwned.decision, 'allow');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hook-adapter blocks npm/yarn, force push, and --no-verify commands, and injects SessionStart briefing', () => {
  const tmpDir = setupHookWorkspace({ bootstrapLocked: false, contractFrozen: true });
  try {
    const startRes = evaluateHookEvent({ rootDir: tmpDir, event: 'SessionStart', payload: {} });
    assert.ok(Array.isArray(startRes.injectSteps));

    for (const badCmd of ['npm install lodash', 'yarn add foo', 'git push --force origin test', 'git commit --no-verify -m x']) {
      const res = evaluateHookEvent({
        rootDir: tmpDir,
        event: 'PreToolUse',
        payload: { toolCall: { name: 'run_command', args: { CommandLine: badCmd } } },
      });
      assert.equal(res.decision, 'deny', `Expected deny for ${badCmd}`);
    }

    const okCmd = evaluateHookEvent({
      rootDir: tmpDir,
      event: 'PreToolUse',
      payload: { toolCall: { name: 'run_command', args: { CommandLine: 'pnpm harness:check' } } },
    });
    assert.equal(okCmd.decision, 'allow');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hook-adapter Stop blocks fake completion via continue when checks fail, and respects continuationActive guard', () => {
  const tmpDir = setupHookWorkspace({ bootstrapLocked: true, contractFrozen: true });
  try {
    // Create oversized AGENTS.md (> 100 lines) to fail harness:check
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), 'line\n'.repeat(110), 'utf8');

    const blockStop = evaluateHookEvent({
      rootDir: tmpDir,
      event: 'Stop',
      payload: { continuationActive: false, terminationReason: 'NO_TOOL_CALL' },
    });
    assert.equal(blockStop.decision, 'continue');
    assert.match(String(blockStop.reason), /DOC_AGENTS_TOO_LONG/);

    // Guard against infinite loop when continuationActive=true
    const releaseLoop = evaluateHookEvent({
      rootDir: tmpDir,
      event: 'Stop',
      payload: { continuationActive: true, terminationReason: 'NO_TOOL_CALL' },
    });
    assert.deepEqual(releaseLoop, {});
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hook-adapter executes from .agents/ cwd as Antigravity hooks.json does at runtime', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const agentsDir = path.join(repoRoot, '.agents');

  const startOut = execFileSync(
    process.execPath,
    ['--experimental-strip-types', '../scripts/harness/hook-adapter.ts', '--event', 'SessionStart'],
    {
      cwd: agentsDir,
      input: JSON.stringify({ workspacePaths: [repoRoot] }),
      encoding: 'utf8',
    }
  );
  const parsedStart = JSON.parse(startOut) as { injectSteps?: unknown[] };
  assert.ok(Array.isArray(parsedStart.injectSteps) && parsedStart.injectSteps.length > 0);

  const preOut = execFileSync(
    process.execPath,
    ['--experimental-strip-types', '../scripts/harness/hook-adapter.ts', '--event', 'PreToolUse'],
    {
      cwd: agentsDir,
      input: JSON.stringify({
        cwd: repoRoot,
        toolCall: { name: 'run_command', args: { CommandLine: 'git status' } },
      }),
      encoding: 'utf8',
    }
  );
  const parsedPre = JSON.parse(preOut) as { decision?: string };
  assert.equal(parsedPre.decision, 'allow');
});
