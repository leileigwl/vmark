import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runArchGraphChecks } from './arch-graph.ts';
import { classifyRisk, parseRiskRulesYaml } from './risk-classifier.ts';
import type { HarnessProjectConfig, ParsedDiffFile } from './types.ts';

const SAMPLE_YAML = `
version: 1
max_auto_merge_lines: 300
tiers:
  high:
    paths:
      - "packages/core/**"
      - "packages/shared/**"
      - "apps/desktop/src/main/**"
      - ".github/**"
  mid:
    paths:
      - "apps/desktop/src/renderer/**"
  low:
    paths:
      - "docs/**"
      - "**/*.test.ts"
`;

function createProject(): HarnessProjectConfig {
  return {
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
      forbidCrossIslandDeepImport: true,
      forbidCycles: true,
    },
    layerBoundaries: [
      {
        from: 'apps/desktop/src/renderer/**',
        forbidImportFrom: ['apps/desktop/src/main/**', 'node:fs', 'electron'],
      },
    ],
    commands: {},
  };
}

test('risk-classifier marks docs-only as low with skipE2e=true, and mixed paths take highest tier', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-risk-'));
  try {
    const rules = parseRiskRulesYaml(SAMPLE_YAML);
    const project = createProject();

    const docsDiff: ParsedDiffFile[] = [
      { file: 'docs/OPERATOR_PLAYBOOK.md', isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 10, removedCount: 2 },
    ];
    const docRes = classifyRisk({ rootDir: tmpDir, project, rules, diffFiles: docsDiff, getBaseContent: () => null });
    assert.equal(docRes.level, 'low');
    assert.equal(docRes.skipE2e, true);

    const mixedDiff: ParsedDiffFile[] = [
      ...docsDiff,
      { file: 'apps/desktop/src/main/index.ts', isNew: false, isDeleted: false, addedLines: [], removedLines: [], addedCount: 5, removedCount: 0 },
    ];
    const mixRes = classifyRisk({ rootDir: tmpDir, project, rules, diffFiles: mixedDiff, getBaseContent: () => null });
    assert.equal(mixRes.level, 'high');
    assert.equal(mixRes.skipE2e, false);
    assert.equal(mixRes.runL3, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('risk-classifier escalates mid-risk path via AST export signature change and via semantic signal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-risk-ast-'));
  try {
    const rules = parseRiskRulesYaml(SAMPLE_YAML);
    const project = createProject();

    const barrelRel = 'apps/desktop/src/renderer/src/features/publish/index.ts';
    fs.mkdirSync(path.dirname(path.join(tmpDir, barrelRel)), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, barrelRel),
      'export function openPublish(mode: "draft" | "live"): void {}\n',
      'utf8'
    );

    const astDiff: ParsedDiffFile[] = [
      { file: barrelRel, isNew: false, isDeleted: false, addedLines: [{ line: 1, content: 'export function openPublish(mode: "draft" | "live"): void {}' }], removedLines: [], addedCount: 1, removedCount: 1 },
    ];
    const astRes = classifyRisk({
      rootDir: tmpDir,
      project,
      rules,
      diffFiles: astDiff,
      getBaseContent: () => 'export function openPublish(): void {}\n',
    });
    assert.equal(astRes.level, 'high');
    assert.ok(astRes.reasons.some((r) => r.startsWith('AST_EXPORT_SIGNATURE_CHANGED')));

    const semRel = 'apps/desktop/src/renderer/src/components/Panel.tsx';
    fs.mkdirSync(path.dirname(path.join(tmpDir, semRel)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, semRel), 'const cp = require("child_process");\n', 'utf8');
    const semDiff: ParsedDiffFile[] = [
      {
        file: semRel,
        isNew: false,
        isDeleted: false,
        addedLines: [{ line: 1, content: 'const cp = require("child_process");' }],
        removedLines: [],
        addedCount: 1,
        removedCount: 0,
      },
    ];
    const semRes = classifyRisk({ rootDir: tmpDir, project, rules, diffFiles: semDiff, getBaseContent: () => '' });
    assert.equal(semRes.level, 'high');
    assert.ok(semRes.reasons.some((r) => r.includes('CHILD_PROCESS')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('arch-graph enforces renderer isolation, cross-island barrel-only imports, and cycle prevention', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-arch-'));
  try {
    const project = createProject();

    // Valid barrel import inside island A -> island B (wait: avoid cycle in valid test, so B does not import A first)
    const islandAIndex = path.join(tmpDir, 'apps/desktop/src/renderer/src/features/auth/index.ts');
    const islandBIndex = path.join(tmpDir, 'apps/desktop/src/renderer/src/features/publish/index.ts');
    const islandBInternal = path.join(tmpDir, 'apps/desktop/src/renderer/src/features/publish/internalHelper.ts');

    fs.mkdirSync(path.dirname(islandAIndex), { recursive: true });
    fs.mkdirSync(path.dirname(islandBIndex), { recursive: true });

    fs.writeFileSync(islandBIndex, 'export const pubOk = true;\n', 'utf8');
    fs.writeFileSync(islandBInternal, 'export const secretInternal = 1;\n', 'utf8');
    fs.writeFileSync(islandAIndex, "import { pubOk } from '../publish/index.ts';\nexport const ok = pubOk;\n", 'utf8');

    assert.equal(runArchGraphChecks(tmpDir, project).length, 0);

    // Trigger deep import, forbidden node:fs import, and cycle B -> A
    fs.writeFileSync(
      islandAIndex,
      "import fs from 'node:fs';\nimport { secretInternal } from '../publish/internalHelper.ts';\nexport const ok = Boolean(fs) && Boolean(secretInternal);\n",
      'utf8'
    );
    fs.writeFileSync(islandBIndex, "import { ok } from '../auth/index.ts';\nexport const b = ok;\n", 'utf8');

    const v = runArchGraphChecks(tmpDir, project);
    const rules = new Set(v.map((i) => i.rule_id));
    assert.ok(rules.has('ARCH_FORBIDDEN_LAYER_IMPORT'));
    assert.ok(rules.has('ARCH_CROSS_ISLAND_DEEP_IMPORT'));
    assert.ok(rules.has('ARCH_ISLAND_CYCLE'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
