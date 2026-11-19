import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type {
  DesignRiskResult,
  HarnessProjectConfig,
  HarnessViolation,
  ParsedDiffFile,
  RiskClassificationResult,
  RiskLevel,
} from './types.ts';
import { matchesAnyGlob, toPosixPath } from './utils.ts';

export interface RiskRulesConfig {
  max_auto_merge_lines: number;
  tiers: {
    high: { paths: string[] };
    mid: { paths: string[] };
    low: { paths: string[] };
  };
}

const TEST_OR_DOC_RE = /\.(test|spec)\.[cm]?[jt]sx?$|\.md$/;
const CODE_EXT_RE = /\.[cm]?[jt]sx?$/;

const SEMANTIC_HIGH_RISK_PATTERNS: Array<{ id: string; re: RegExp; hint: string }> = [
  {
    id: 'IPC_OR_SANDBOX_PRIMITIVE',
    re: /\b(?:ipcMain|ipcRenderer|contextBridge|safeStorage)\b/,
    hint: 'Touches IPC bridge or encrypted credential storage; escalate to risk:high.',
  },
  {
    id: 'CHILD_PROCESS_EXEC',
    re: /\bchild_process\b|\b(?:execSync|execFileSync|spawnSync)\s*\(/,
    hint: 'Introduces OS process execution; escalate to risk:high.',
  },
  {
    id: 'DYNAMIC_CODE_EVAL',
    re: /\beval\s*\(|new\s+Function\s*\(/,
    hint: 'Dynamic code evaluation detected; escalate to risk:high.',
  },
  {
    id: 'COOKIE_OR_SQL_MUTATION',
    re: /\.cookies\.(?:get|set|remove)\b|\b(?:DROP|ALTER)\s+TABLE\b/i,
    hint: 'Modifies session cookies or database schema DDL; escalate to risk:high.',
  },
  {
    id: 'ENV_SECRET_ACCESS',
    re: /\bprocess\.env\./,
    hint: 'Accesses environment variables; escalate to risk:high for review.',
  },
];

/**
 * Lightweight zero-dependency parser tailored for `.github/risk-rules.yml`.
 */
export function parseRiskRulesYaml(raw: string): RiskRulesConfig {
  const rules: RiskRulesConfig = {
    max_auto_merge_lines: 300,
    tiers: { high: { paths: [] }, mid: { paths: [] }, low: { paths: [] } },
  };
  let currentTier: 'high' | 'mid' | 'low' | null = null;
  let inPaths = false;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const maxLinesMatch = trimmed.match(/^max_auto_merge_lines:\s*(\d+)/);
    if (maxLinesMatch) {
      rules.max_auto_merge_lines = Number.parseInt(maxLinesMatch[1], 10);
      continue;
    }

    const tierMatch = line.match(/^  (high|mid|low):\s*$/);
    if (tierMatch) {
      currentTier = tierMatch[1] as 'high' | 'mid' | 'low';
      inPaths = false;
      continue;
    }

    if (currentTier && line.match(/^    paths:\s*$/)) {
      inPaths = true;
      continue;
    }
    if (currentTier && line.match(/^    [a-z_]+:/)) {
      inPaths = false;
      continue;
    }

    if (currentTier && inPaths && trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
      if (value) rules.tiers[currentTier].paths.push(value);
    }
  }
  return rules;
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * Extract exported public signatures via TypeScript AST (ignoring internal function bodies).
 */
function extractExportSignatures(filePath: string, sourceText: string): string[] {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const signatures: string[] = [];

  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt)) {
      signatures.push(printer.printNode(ts.EmitHint.Unspecified, stmt, sf).replace(/\s+/g, ' ').trim());
      continue;
    }
    if (!hasExportModifier(stmt)) continue;

    if (ts.isFunctionDeclaration(stmt)) {
      const name = stmt.name?.text ?? 'default';
      const params = stmt.parameters.map((p) => printer.printNode(ts.EmitHint.Unspecified, p, sf)).join(', ');
      const ret = stmt.type ? `: ${printer.printNode(ts.EmitHint.Unspecified, stmt.type, sf)}` : '';
      signatures.push(`fn ${name}(${params})${ret}`.replace(/\s+/g, ' ').trim());
    } else if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      signatures.push(printer.printNode(ts.EmitHint.Unspecified, stmt, sf).replace(/\s+/g, ' ').trim());
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const typeStr = decl.type ? `: ${printer.printNode(ts.EmitHint.Unspecified, decl.type, sf)}` : '';
        signatures.push(`const ${decl.name.getText(sf)}${typeStr}`.replace(/\s+/g, ' ').trim());
      }
    } else if (ts.isClassDeclaration(stmt)) {
      const name = stmt.name?.text ?? 'default';
      const members = stmt.members
        .filter((m) => !ts.isConstructorDeclaration(m))
        .map((m) => (m.name ? m.name.getText(sf) : ''))
        .filter(Boolean)
        .join(',');
      signatures.push(`class ${name}{${members}}`);
    }
  }
  return signatures.sort();
}

function isBarrelOrContractFile(relPath: string): boolean {
  return (
    relPath.endsWith('/index.ts') ||
    relPath.endsWith('/index.tsx') ||
    relPath.startsWith('packages/shared/') ||
    relPath.startsWith('apps/desktop/src/preload/')
  );
}

function elevate(current: RiskLevel, next: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { low: 0, mid: 1, high: 2 };
  return rank[next] > rank[current] ? next : current;
}

function classifyPathTier(
  relPath: string,
  project: HarnessProjectConfig,
  rules: RiskRulesConfig
): { tier: RiskLevel; reason: string | null } {
  if (project.bootstrapLocked && matchesAnyGlob(relPath, project.bootstrapLockProtectedPaths)) {
    return { tier: 'high', reason: `BOOTSTRAP_LOCKED_PATH:${relPath}` };
  }
  if (matchesAnyGlob(relPath, rules.tiers.high.paths)) {
    return { tier: 'high', reason: `HIGH_RISK_PATH:${relPath}` };
  }
  if (matchesAnyGlob(relPath, rules.tiers.mid.paths)) {
    return { tier: 'mid', reason: `MID_RISK_PATH:${relPath}` };
  }
  if (matchesAnyGlob(relPath, rules.tiers.low.paths)) {
    return { tier: 'low', reason: null };
  }
  return { tier: 'mid', reason: `UNCLASSIFIED_PATH_DEFAULT_MID:${relPath}` };
}

/**
 * Shift-Left Design-Time Risk Assessment: predicts risk tier, required L0-L3 checks,
 * and recommended model tier during brainstorming/OpenSpec planning before code is written.
 */
export function assessDesignRisk(options: {
  project: HarnessProjectConfig;
  rules: RiskRulesConfig;
  paths: string[];
  touchesContractOrBarrel?: boolean;
  touchesSensitivePrimitives?: boolean;
}): DesignRiskResult {
  const { project, rules, paths, touchesContractOrBarrel = false, touchesSensitivePrimitives = false } = options;
  const normalizedPaths = paths.map((p) => toPosixPath(p.trim())).filter(Boolean);
  let level: RiskLevel = 'low';
  const reasons: string[] = [];

  for (const relPath of normalizedPaths) {
    const pathRes = classifyPathTier(relPath, project, rules);
    level = elevate(level, pathRes.tier);
    if (pathRes.reason) reasons.push(pathRes.reason);
  }

  if (touchesContractOrBarrel) {
    level = elevate(level, 'high');
    reasons.push('AST_EXPORT_SIGNATURE_EXPECTED');
  }
  if (touchesSensitivePrimitives) {
    level = elevate(level, 'high');
    reasons.push('SEMANTIC_PRIMITIVE_EXPECTED');
  }

  const requiredChecks: Array<'L0' | 'L1' | 'L2' | 'L3'> =
    level === 'high' ? ['L0', 'L1', 'L2', 'L3'] : level === 'mid' ? ['L0', 'L1', 'L2'] : ['L0'];

  return {
    level,
    badge: `[risk:${level}]`,
    reasons: [...new Set(reasons)],
    requiredChecks,
    recommendedAssigneeTier: level === 'high' ? 'frontier-model' : 'small-model',
    paths: normalizedPaths,
  };
}

/**
 * Three-layer deterministic risk classifier: Path+Size + TypeScript AST Export Signatures + Semantic Diff Signals.
 */
export function classifyRisk(options: {
  rootDir: string;
  project: HarnessProjectConfig;
  rules: RiskRulesConfig;
  diffFiles: ParsedDiffFile[];
  getBaseContent: (filePath: string) => string | null;
  archViolations?: HarnessViolation[];
}): RiskClassificationResult {
  const { rootDir, project, rules, diffFiles, getBaseContent, archViolations = [] } = options;
  const reasons: string[] = [];
  const violations: HarnessViolation[] = [];
  const changedFiles = diffFiles.map((d) => toPosixPath(d.file));
  let diffLines = 0;
  let level: RiskLevel = 'low';

  if (diffFiles.length === 0) {
    return { level: 'low', reasons: ['NO_CHANGES'], diffLines: 0, changedFiles: [], skipE2e: true, runL3: false, violations: [] };
  }

  for (const diff of diffFiles) {
    const relPath = toPosixPath(diff.file);
    diffLines += diff.addedCount + diff.removedCount;

    // Layer 1: Path rules & Bootstrap lock
    const pathRes = classifyPathTier(relPath, project, rules);
    level = elevate(level, pathRes.tier);
    if (pathRes.reason) reasons.push(pathRes.reason);

    if (diff.isDeleted || !CODE_EXT_RE.test(relPath)) continue;
    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath)) continue;
    const currentText = fs.readFileSync(absPath, 'utf8');

    // Layer 2: AST Export signature drift on Barrels & shared contracts
    if (isBarrelOrContractFile(relPath)) {
      const baseText = getBaseContent(relPath);
      if (baseText !== null) {
        const oldSigs = extractExportSignatures(relPath, baseText);
        const newSigs = extractExportSignatures(relPath, currentText);
        if (JSON.stringify(oldSigs) !== JSON.stringify(newSigs)) {
          level = elevate(level, 'high');
          reasons.push(`AST_EXPORT_SIGNATURE_CHANGED:${relPath}`);
        }
      }
    }

    // Layer 3: Diff semantic high-risk pattern detection
    if (!TEST_OR_DOC_RE.test(relPath)) {
      for (const added of diff.addedLines) {
        for (const sig of SEMANTIC_HIGH_RISK_PATTERNS) {
          if (sig.re.test(added.content)) {
            level = elevate(level, 'high');
            reasons.push(`SEMANTIC_${sig.id}:${relPath}:${added.line}`);
            violations.push({
              file: relPath,
              line: added.line,
              rule_id: `RISK_${sig.id}`,
              fix_hint: sig.hint,
            });
          }
        }
      }
    }
  }

  if (diffLines > rules.max_auto_merge_lines) {
    level = elevate(level, 'high');
    reasons.push(`DIFF_LINES_EXCEEDED:${diffLines}>${rules.max_auto_merge_lines}`);
  }

  if (archViolations.length > 0) {
    level = elevate(level, 'high');
    reasons.push(`ARCH_TOPOLOGY_VIOLATIONS:${archViolations.length}`);
  }

  const allDocsOnly = changedFiles.every((f) =>
    f.startsWith('docs/') || f.startsWith('openspec/') || (f.endsWith('.md') && !f.startsWith('LICENSE'))
  );

  return {
    level,
    reasons: [...new Set(reasons)],
    diffLines,
    changedFiles,
    skipE2e: allDocsOnly,
    runL3: level === 'high',
    violations,
  };
}
