import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatSlopMarkdown, parseKnipJsonOutput, runSlopAudit } from './slop.ts';
import type { HarnessProjectConfig, RatchetConfig } from './types.ts';

function sampleProject(): HarnessProjectConfig {
  return {
    projectId: 'slop-demo',
    profile: 'desktop-electron',
    owner: 'leileigwl',
    githubNotifyUser: 'leileigwl',
    bootstrapLocked: true,
    bootstrapLockProtectedPaths: [],
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

test('parseKnipJsonOutput extracts dead files, exports, types, and deps', () => {
  const raw = JSON.stringify({
    issues: [
      {
        file: '/repo/packages/core/src/orphan.ts',
        exports: [{ name: 'deadHelper', line: 12 }],
        types: [{ name: 'DeadType', line: 3 }],
        dependencies: [{ name: 'unused-pkg' }],
      },
    ],
  });
  const res = parseKnipJsonOutput(raw, '/repo');
  assert.equal(res.length, 3);
  assert.equal(res[0].rule_id, 'SLOP_UNUSED_EXPORT');
  assert.equal(res[1].rule_id, 'SLOP_UNUSED_TYPE');
  assert.equal(res[2].rule_id, 'SLOP_UNUSED_DEPENDENCY');
});

test('runSlopAudit detects bloat, expired exemptions, assertionless tests, and doc entropy', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-slop-'));
  try {
    const srcRel = 'packages/core/src/sample.ts';
    fs.mkdirSync(path.dirname(path.join(tmpDir, srcRel)), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, srcRel),
      [
        '// @harness-exempt: old hack (expires: 2020-01-01)',
        'export const a = ({} as any).foo;',
        'export function run() { console.log("stray"); try { return 1; } catch {} }',
      ].join('\n'),
      'utf8'
    );

    const testRel = 'packages/core/src/empty.test.ts';
    fs.writeFileSync(path.join(tmpDir, testRel), 'test("empty case", () => { const x = 1; });\n', 'utf8');

    fs.mkdirSync(path.join(tmpDir, 'openspec/changes/pending-change'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\nSee [missing](docs/MISSING.md)\n', 'utf8');

    const ratchet: RatchetConfig = {
      defaultNewFileMaxLines: 500,
      files: { [srcRel]: { maxLines: 5, targetLines: 2 } },
    };

    const report = runSlopAudit({
      rootDir: tmpDir,
      project: sampleProject(),
      ratchet,
      runKnip: false,
      todayIso: '2026-11-19',
    });

    assert.ok(report.categories.type_decay_residue >= 3);
    assert.ok(report.categories.test_decay >= 1);
    assert.ok(report.categories.doc_spec_entropy >= 2);
    assert.ok(report.categories.bloat_duplication >= 1);
    const md = formatSlopMarkdown(report, 'leileigwl');
    assert.ok(md.includes('@leileigwl'));
    assert.ok(md.includes('5 类 AI Slop 分类账本'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
