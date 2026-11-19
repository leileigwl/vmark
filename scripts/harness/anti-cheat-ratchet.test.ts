import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAntiCheatChecks, scanSourceAntiCheat } from './anti-cheat.ts';
import { runRatchetAndDocChecks } from './ratchet.ts';
import type { HarnessProjectConfig, ParsedDiffFile, RatchetConfig } from './types.ts';

function createProject(bootstrapLocked = false): HarnessProjectConfig {
  return {
    projectId: 'test',
    profile: 'desktop-electron',
    owner: 'leileigwl',
    bootstrapLocked,
    bootstrapLockProtectedPaths: ['.harness/**', '.github/**', 'AGENTS.md'],
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
}

test('anti-cheat blocks .skip, as any, and @ts-ignore without valid exemption', () => {
  const testCode = [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    'test.skip("skipped case", () => { assert.ok(true); });',
    'const x = ({} as any).foo;',
    '// @ts-ignore',
    'const y = 1;',
  ].join('\n');

  const added = new Set([1, 2, 3, 4, 5, 6]);
  const v = scanSourceAntiCheat('packages/core/src/sample.test.ts', testCode, added, '2026-11-19');
  const rules = v.map((item) => item.rule_id);
  assert.ok(rules.includes('ANTI_CHEAT_TEST_SKIP'));
  assert.ok(rules.includes('ANTI_CHEAT_AS_ANY'));
  assert.ok(rules.includes('ANTI_CHEAT_SUPPRESSION'));
});

test('anti-cheat allows valid unexpired @harness-exempt comment', () => {
  const code = [
    '// @harness-exempt: third-party missing declaration (expires: 2027-01-01)',
    'const x = ({} as any).foo;',
  ].join('\n');
  const v = scanSourceAntiCheat('packages/core/src/ok.ts', code, new Set([1, 2]), '2026-11-19');
  assert.equal(v.length, 0);
});

test('anti-cheat blocks bootstrap-protected path modification when locked & detects assertion drop', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ac-'));
  try {
    const testRel = 'packages/core/src/demo.test.ts';
    fs.mkdirSync(path.dirname(path.join(tmpDir, testRel)), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, testRel),
      "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('x', () => { assert.ok(true); });\n",
      'utf8'
    );
    const ghRel = '.github/workflows/ci.yml';
    fs.mkdirSync(path.dirname(path.join(tmpDir, ghRel)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ghRel), 'name: ci\n', 'utf8');

    const diffFiles: ParsedDiffFile[] = [
      { file: testRel, isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 0, removedCount: 1 },
      { file: ghRel, isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 1, removedCount: 0 },
    ];

    const v = runAntiCheatChecks({
      rootDir: tmpDir,
      project: createProject(true),
      diffFiles,
      getBaseContent: () =>
        "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('x', () => { assert.ok(true); assert.equal(1, 1); });\n",
      todayIso: '2026-11-19',
    });

    const ruleIds = new Set(v.map((item) => item.rule_id));
    assert.ok(ruleIds.has('ANTI_CHEAT_BOOTSTRAP_LOCKED'));
    assert.ok(ruleIds.has('ANTI_CHEAT_ASSERTION_DROP'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ratchet blocks oversized new file, blocks ratchet growth, and detects dead links', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ratchet-'));
  try {
    const bigNew = 'packages/core/src/big.ts';
    fs.mkdirSync(path.dirname(path.join(tmpDir, bigNew)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, bigNew), 'export const a = 1;\n'.repeat(505), 'utf8');

    const legacy = 'apps/desktop/src/main/index.ts';
    fs.mkdirSync(path.dirname(path.join(tmpDir, legacy)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, legacy), 'export const b = 2;\n'.repeat(610), 'utf8');

    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n[missing](docs/non-existent.md)\n', 'utf8');

    const ratchet: RatchetConfig = {
      defaultNewFileMaxLines: 500,
      files: { [legacy]: { maxLines: 600, targetLines: 500 } },
    };

    const res = runRatchetAndDocChecks({
      rootDir: tmpDir,
      project: createProject(false),
      ratchet,
    });
    const ruleIds = new Set(res.violations.map((item) => item.rule_id));
    assert.ok(ruleIds.has('RATCHET_NEW_FILE_TOO_LARGE'));
    assert.ok(ruleIds.has('RATCHET_FILE_GREW'));
    assert.ok(ruleIds.has('DOC_DEAD_LINK'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('anti-cheat permits Stage A -> B initial lock-in transition but blocks post-lock edits', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lockin-'));
  try {
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.harness/project.json'), JSON.stringify({ bootstrapLocked: true }), 'utf8');
    fs.mkdirSync(path.join(tmpDir, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.github/workflows/ci.yml'), 'name: ci\n', 'utf8');

    const diffFiles: ParsedDiffFile[] = [
      { file: '.harness/project.json', isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 1, removedCount: 1 },
      { file: '.github/workflows/ci.yml', isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 1, removedCount: 0 },
    ];

    const stageATransition = runAntiCheatChecks({
      rootDir: tmpDir,
      project: createProject(true),
      diffFiles,
      getBaseContent: (f) => (f === '.harness/project.json' ? JSON.stringify({ bootstrapLocked: false }) : ''),
    });
    assert.equal(stageATransition.length, 0);

    const postLockViolation = runAntiCheatChecks({
      rootDir: tmpDir,
      project: createProject(true),
      diffFiles,
      getBaseContent: (f) => (f === '.harness/project.json' ? JSON.stringify({ bootstrapLocked: true }) : ''),
    });
    assert.ok(postLockViolation.some((v) => v.rule_id === 'ANTI_CHEAT_BOOTSTRAP_LOCKED'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
