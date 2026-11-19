import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runRatchetAndDocChecks } from './ratchet.ts';
import type { HarnessProjectConfig, RatchetConfig } from './types.ts';
import { countFileLines, toPosixPath, walkSourceFiles } from './utils.ts';

export type SlopCategory =
  | 'dead_code'
  | 'bloat_duplication'
  | 'type_decay_residue'
  | 'test_decay'
  | 'doc_spec_entropy';

export interface SlopFinding {
  category: SlopCategory;
  file: string;
  line: number;
  rule_id: string;
  detail: string;
}

export interface CleanupSliceSuggestion {
  sliceId: string;
  targetFiles: string[];
  estimatedDiffLines: number;
  summary: string;
}

export interface SlopAuditReport {
  generatedAt: string;
  total: number;
  categories: Record<SlopCategory, number>;
  findings: SlopFinding[];
  suggestedSlices: CleanupSliceSuggestion[];
}

interface KnipIssueEntry {
  file?: string;
  files?: Array<string | { name: string }>;
  exports?: Array<{ name: string; line?: number }>;
  types?: Array<{ name: string; line?: number }>;
  dependencies?: Array<{ name: string }>;
  devDependencies?: Array<{ name: string }>;
}

/** Parses `knip --reporter json` stdout into structured `dead_code` findings. */
export function parseKnipJsonOutput(stdout: string, rootDir: string): SlopFinding[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let parsed: { issues?: KnipIssueEntry[]; files?: string[] };
  try {
    parsed = JSON.parse(trimmed) as { issues?: KnipIssueEntry[]; files?: string[] };
  } catch {
    return [];
  }

  const out: SlopFinding[] = [];
  for (const rawFile of parsed.files ?? []) {
    out.push({
      category: 'dead_code',
      file: toPosixPath(rawFile, rootDir),
      line: 1,
      rule_id: 'SLOP_UNUSED_FILE',
      detail: 'Orphan file reported by knip.',
    });
  }

  for (const entry of parsed.issues ?? []) {
    const file = entry.file ? toPosixPath(entry.file, rootDir) : 'package.json';
    for (const f of entry.files ?? []) {
      const name = typeof f === 'string' ? f : f.name;
      out.push({ category: 'dead_code', file: toPosixPath(name, rootDir), line: 1, rule_id: 'SLOP_UNUSED_FILE', detail: 'Unused file reported by knip.' });
    }
    for (const exp of entry.exports ?? []) {
      out.push({ category: 'dead_code', file, line: exp.line ?? 1, rule_id: 'SLOP_UNUSED_EXPORT', detail: `Unused export \`${exp.name}\`.` });
    }
    for (const typ of entry.types ?? []) {
      out.push({ category: 'dead_code', file, line: typ.line ?? 1, rule_id: 'SLOP_UNUSED_TYPE', detail: `Unused exported type \`${typ.name}\`.` });
    }
    for (const dep of [...(entry.dependencies ?? []), ...(entry.devDependencies ?? [])]) {
      out.push({ category: 'dead_code', file, line: 1, rule_id: 'SLOP_UNUSED_DEPENDENCY', detail: `Unused dependency \`${dep.name}\`.` });
    }
  }
  return out;
}

function scanDuplicateBlocks(rootDir: string, files: string[]): SlopFinding[] {
  const WINDOW = 12;
  const seen = new Map<string, { file: string; line: number }>();
  const findings: SlopFinding[] = [];
  const reportedFiles = new Set<string>();

  for (const rel of files) {
    if (/\.(test|spec)\./.test(rel)) continue;
    const rawLines = fs.readFileSync(path.join(rootDir, rel), 'utf8').split('\n');
    const normalized = rawLines
      .map((txt, idx) => ({ line: idx + 1, norm: txt.replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.norm.length > 0 && !x.norm.startsWith('import '));

    for (let i = 0; i <= normalized.length - WINDOW; i += 1) {
      const chunk = normalized.slice(i, i + WINDOW).map((x) => x.norm).join('\n');
      if (chunk.length < 220) continue;
      const first = seen.get(chunk);
      if (first && first.file !== rel && !reportedFiles.has(`${rel}:${first.file}`)) {
        reportedFiles.add(`${rel}:${first.file}`);
        findings.push({
          category: 'bloat_duplication',
          file: rel,
          line: normalized[i].line,
          rule_id: 'SLOP_DUPLICATE_BLOCK',
          detail: `>=12-line block duplicated from ${first.file}:${first.line}.`,
        });
      } else if (!first) {
        seen.set(chunk, { file: rel, line: normalized[i].line });
      }
    }
  }
  return findings;
}

function scanTypeAndResidue(rootDir: string, files: string[], todayIso: string): SlopFinding[] {
  const out: SlopFinding[] = [];
  const EXEMPT_EXP_RE = /@harness-exempt:.*expires:\s*(\d{4}-\d{2}-\d{2})/;
  const DECAY_RE = /\bas any\b|(?:\/\/|\/\*)\s*(?:@ts-ignore|@ts-nocheck|eslint-disable)\b/;
  const EMPTY_CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/;

  for (const rel of files) {
    const isTest = /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
    if (isTest) continue;
    const lines = fs.readFileSync(path.join(rootDir, rel), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i];
      const lineNo = i + 1;
      const exp = text.match(EXEMPT_EXP_RE);
      if (exp && exp[1] < todayIso) {
        out.push({ category: 'type_decay_residue', file: rel, line: lineNo, rule_id: 'SLOP_EXPIRED_EXEMPTION', detail: `Expired exemption (${exp[1]} < ${todayIso}).` });
      }
      if (!rel.startsWith('scripts/harness/') && DECAY_RE.test(text) && !EXEMPT_EXP_RE.test(text) && !EXEMPT_EXP_RE.test(lines[i - 1] ?? '')) {
        out.push({ category: 'type_decay_residue', file: rel, line: lineNo, rule_id: 'SLOP_TYPE_DECAY', detail: 'Type safety escape or lint suppression without active exemption.' });
      }
      if (EMPTY_CATCH_RE.test(text)) {
        out.push({ category: 'type_decay_residue', file: rel, line: lineNo, rule_id: 'SLOP_EMPTY_CATCH', detail: 'Empty catch block swallows errors silently.' });
      }
      if (!isTest && !rel.startsWith('scripts/') && /\bconsole\.log\s*\(/.test(text)) {
        out.push({ category: 'type_decay_residue', file: rel, line: lineNo, rule_id: 'SLOP_DEBUG_CONSOLE_LOG', detail: 'Stray console.log left in application source.' });
      }
    }
  }
  return out;
}

function scanTestDecay(rootDir: string, files: string[]): SlopFinding[] {
  const out: SlopFinding[] = [];
  for (const rel of files) {
    if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)) continue;
    const text = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    if (!rel.startsWith('scripts/harness/') && /\b(?:test|it|describe)\.(?:skip|only)\b|\bx(?:it|test|describe)\s*\(/.test(text)) {
      out.push({ category: 'test_decay', file: rel, line: 1, rule_id: 'SLOP_SKIPPED_TEST', detail: 'Skipped or isolated test suite found.' });
    }
    if (/\b(?:test|it)\s*\(/.test(text) && !/\b(?:expect|assert)\b/.test(text)) {
      out.push({ category: 'test_decay', file: rel, line: 1, rule_id: 'SLOP_ASSERTIONLESS_TEST', detail: 'Test file defines test cases without assertions.' });
    }
  }
  return out;
}

function scanDocAndSpecEntropy(
  rootDir: string,
  project: HarnessProjectConfig,
  ratchet: RatchetConfig
): SlopFinding[] {
  const out: SlopFinding[] = [];
  const { violations } = runRatchetAndDocChecks({ rootDir, project, ratchet });
  for (const v of violations) {
    const category: SlopCategory = v.rule_id.startsWith('DOC_') ? 'doc_spec_entropy' : 'bloat_duplication';
    out.push({ category, file: v.file, line: v.line, rule_id: v.rule_id, detail: v.fix_hint });
  }

  for (const [legacyFile, cfg] of Object.entries(ratchet.files)) {
    const abs = path.join(rootDir, legacyFile);
    if (!fs.existsSync(abs)) continue;
    const curLines = countFileLines(abs);
    if (curLines > cfg.targetLines) {
      out.push({
        category: 'bloat_duplication',
        file: legacyFile,
        line: curLines,
        rule_id: 'SLOP_RATCHET_OVER_TARGET',
        detail: `Ratchet debt: ${curLines} lines > target ${cfg.targetLines} lines.`,
      });
    }
  }

  const changesDir = path.join(rootDir, 'openspec/changes');
  if (fs.existsSync(changesDir)) {
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      out.push({
        category: 'doc_spec_entropy',
        file: `openspec/changes/${entry.name}`,
        line: 1,
        rule_id: 'SLOP_UNARCHIVED_OPENSPEC',
        detail: `Active unarchived OpenSpec change \`${entry.name}\` pending archive once landed.`,
      });
    }
  }
  return out;
}

function buildCleanupSlices(findings: SlopFinding[]): CleanupSliceSuggestion[] {
  const byFile = new Map<string, SlopFinding[]>();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }
  const suggestions: CleanupSliceSuggestion[] = [];
  let idx = 1;
  for (const [file, items] of byFile.entries()) {
    if (idx > 6) break;
    suggestions.push({
      sliceId: `slop-clean-${String(idx).padStart(2, '0')}`,
      targetFiles: [file],
      estimatedDiffLines: Math.min(280, items.length * 18 + 20),
      summary: `${items[0].rule_id} (${items.length} 项): ${items[0].detail}`,
    });
    idx += 1;
  }
  return suggestions;
}

/** Runs all 5 deterministic AI Slop audit dimensions across the repository. */
export function runSlopAudit(options: {
  rootDir: string;
  project: HarnessProjectConfig;
  ratchet: RatchetConfig;
  runKnip?: boolean;
  todayIso?: string;
}): SlopAuditReport {
  const { rootDir, project, ratchet, runKnip = true } = options;
  const todayIso = options.todayIso ?? new Date().toISOString().slice(0, 10);

  const scanRoots = ['apps/desktop/src', 'apps/desktop/tests', 'packages', 'scripts/harness'];
  const allFiles: string[] = [];
  for (const r of scanRoots) {
    allFiles.push(...walkSourceFiles(path.join(rootDir, r), rootDir, ['.ts', '.tsx']));
  }

  let deadFindings: SlopFinding[] = [];
  if (runKnip) {
    const knipRes = spawnSync('pnpm', ['exec', 'knip', '--reporter', 'json'], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    deadFindings = parseKnipJsonOutput(knipRes.stdout || '', rootDir);
  }

  const findings: SlopFinding[] = [
    ...deadFindings,
    ...scanDuplicateBlocks(rootDir, allFiles),
    ...scanTypeAndResidue(rootDir, allFiles, todayIso),
    ...scanTestDecay(rootDir, allFiles),
    ...scanDocAndSpecEntropy(rootDir, project, ratchet),
  ];

  const categories: Record<SlopCategory, number> = {
    dead_code: 0,
    bloat_duplication: 0,
    type_decay_residue: 0,
    test_decay: 0,
    doc_spec_entropy: 0,
  };
  for (const f of findings) categories[f.category] += 1;

  return {
    generatedAt: new Date().toISOString(),
    total: findings.length,
    categories,
    findings,
    suggestedSlices: buildCleanupSlices(findings),
  };
}

/** Formats Slop audit ledger into an Issue-ready Markdown report with @mention and cleanup slices. */
export function formatSlopMarkdown(report: SlopAuditReport, notifyUser: string): string {
  const lines: string[] = [
    `@${notifyUser} 本周 **AI Slop 体检周报** 已自动生成（总计 \`${report.total}\` 项待消化债务）。`,
    '',
    '### 5 类 AI Slop 分类账本',
    '| 类别 | 数量 | 说明 |',
    '| :--- | ---: | :--- |',
    `| 1. 死代码与孤儿导出 (\`dead_code\`) | ${report.categories.dead_code} | knip 未引用文件/导出/依赖 |`,
    `| 2. 膨胀与重复块 (\`bloat_duplication\`) | ${report.categories.bloat_duplication} | 棘轮超标枢纽/重复代码块 |`,
    `| 3. 类型腐化与调试残留 (\`type_decay_residue\`) | ${report.categories.type_decay_residue} | 过期豁免/空 catch/残留 console.log |`,
    `| 4. 测试腐化 (\`test_decay\`) | ${report.categories.test_decay} | 跳过测试或无断言用例 |`,
    `| 5. 文档与 Spec 熵增 (\`doc_spec_entropy\`) | ${report.categories.doc_spec_entropy} | 死链/超行/未归档变更 |`,
    '',
    '### 建议并发清理切片（每片 <300 行且路径互斥）',
  ];

  if (report.suggestedSlices.length === 0) {
    lines.push('- 当前仓库零存量债务，无需生成清理切片。');
  } else {
    for (const s of report.suggestedSlices) {
      lines.push(`- **${s.sliceId}** (\`${s.targetFiles.join(', ')}\`, ~${s.estimatedDiffLines} 行): ${s.summary}`);
    }
  }

  lines.push('', '<details><summary>明细清单（前 30 条）</summary>', '');
  for (const f of report.findings.slice(0, 30)) {
    lines.push(`- [${f.category}] \`${f.file}:${f.line}\` (\`${f.rule_id}\`): ${f.detail}`);
  }
  lines.push('', '</details>', '', '> 单窗口指令：`处理本周 Slop Issue` 即可触发互斥清理切片并下调棘轮。');
  return lines.join('\n');
}
