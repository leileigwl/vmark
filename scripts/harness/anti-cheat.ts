import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type {
  HarnessProjectConfig,
  HarnessViolation,
  ParsedDiffFile,
} from './types.ts';
import { matchesAnyGlob, toPosixPath } from './utils.ts';

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const EXEMPT_RE = /@harness-exempt:\s*\S+.*expires:\s*(\d{4}-\d{2}-\d{2})/;

function hasValidExemption(lines: string[], zeroBasedIdx: number, todayIso: string): boolean {
  const candidates = [lines[zeroBasedIdx] ?? '', lines[zeroBasedIdx - 1] ?? ''];
  for (const text of candidates) {
    const match = text.match(EXEMPT_RE);
    if (match && match[1] >= todayIso) {
      return true;
    }
  }
  return false;
}

function isTestSkipCall(expr: ts.LeftHandSideExpression): boolean {
  if (ts.isPropertyAccessExpression(expr)) {
    const prop = expr.name.text;
    const obj = expr.expression;
    if ((prop === 'skip' || prop === 'only') && ts.isIdentifier(obj)) {
      return ['test', 'it', 'describe', 'suite'].includes(obj.text);
    }
  }
  if (ts.isIdentifier(expr)) {
    return ['xit', 'xdescribe', 'xtest', 'fit', 'fdescribe'].includes(expr.text);
  }
  return false;
}

function countTestAssertionsAst(sourceText: string, filePath: string): number {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'expect' || expr.text === 'assert')) {
        count += 1;
      } else if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === 'assert'
      ) {
        count += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return count;
}

/**
 * Scan added lines in a TypeScript/TSX file via AST + comment directives for anti-cheat violations.
 */
export function scanSourceAntiCheat(
  filePath: string,
  sourceText: string,
  addedLineNumbers: Set<number>,
  todayIso = new Date().toISOString().slice(0, 10)
): HarnessViolation[] {
  const violations: HarnessViolation[] = [];
  const lines = sourceText.split('\n');
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const isTest = TEST_FILE_RE.test(filePath);

  // AST checks on added lines (or whole file if addedLineNumbers is empty for direct check)
  const checkLine = (lineOneBased: number): boolean =>
    addedLineNumbers.size === 0 || addedLineNumbers.has(lineOneBased);

  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      if (checkLine(line + 1) && !hasValidExemption(lines, line, todayIso)) {
        violations.push({
          file: filePath,
          line: line + 1,
          rule_id: 'ANTI_CHEAT_AS_ANY',
          fix_hint: 'Replace `as any` with concrete type or narrowing; temporary use requires `@harness-exempt: <reason> (expires: YYYY-MM-DD)`.',
        });
      }
    }

    if (isTest && ts.isCallExpression(node) && isTestSkipCall(node.expression)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      if (checkLine(line + 1) && !hasValidExemption(lines, line, todayIso)) {
        violations.push({
          file: filePath,
          line: line + 1,
          rule_id: 'ANTI_CHEAT_TEST_SKIP',
          fix_hint: 'Remove `.skip`/`.only` so all tests execute deterministically.',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Directive comment checks for suppression pragmas
  const PRAGMA_RE = /(?:^|\s)(?:\/\/|\/\*)\s*(?:@ts-ignore|@ts-nocheck|eslint-disable)\b/;
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    if (!checkLine(lineNo)) continue;
    if (PRAGMA_RE.test(lines[i]) && !hasValidExemption(lines, i, todayIso)) {
      violations.push({
        file: filePath,
        line: lineNo,
        rule_id: 'ANTI_CHEAT_SUPPRESSION',
        fix_hint: 'Fix root type/lint issue instead of suppression directives, or add `@harness-exempt` with expiry.',
      });
    }
  }

  return violations;
}

/**
 * Evaluate all anti-cheat gates across changed files, unified diffs, and bootstrap lock rules.
 */
export function runAntiCheatChecks(options: {
  rootDir: string;
  project: HarnessProjectConfig;
  diffFiles: ParsedDiffFile[];
  getBaseContent: (filePath: string) => string | null;
  todayIso?: string;
}): HarnessViolation[] {
  const { rootDir, project, diffFiles, getBaseContent } = options;
  const todayIso = options.todayIso ?? new Date().toISOString().slice(0, 10);
  const violations: HarnessViolation[] = [];

  for (const diff of diffFiles) {
    const relPath = toPosixPath(diff.file);

    // 1. Bootstrap Lock Guard
    if (project.bootstrapLocked && matchesAnyGlob(relPath, project.bootstrapLockProtectedPaths)) {
      violations.push({
        file: relPath,
        line: 1,
        rule_id: 'ANTI_CHEAT_BOOTSTRAP_LOCKED',
        fix_hint: 'Core harness/CI/contract path is locked (`bootstrapLocked: true`). Run `pnpm harness:unlock-bootstrap` if intentional.',
      });
    }

    if (diff.isDeleted) continue;

    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath)) continue;

    if (/\.[cm]?[jt]sx?$/.test(relPath)) {
      const currentText = fs.readFileSync(absPath, 'utf8');
      const addedSet = new Set(diff.addedLines.map((a) => a.line));
      violations.push(...scanSourceAntiCheat(relPath, currentText, addedSet, todayIso));

      // 2. Assertion reduction check on existing test files
      if (TEST_FILE_RE.test(relPath) && !diff.isNew) {
        const baseText = getBaseContent(relPath);
        if (baseText !== null) {
          const oldCount = countTestAssertionsAst(baseText, relPath);
          const newCount = countTestAssertionsAst(currentText, relPath);
          if (newCount < oldCount && !currentText.includes('@harness-exempt:')) {
            violations.push({
              file: relPath,
              line: 1,
              rule_id: 'ANTI_CHEAT_ASSERTION_DROP',
              fix_hint: `Assertions dropped from ${oldCount} to ${newCount}. Restore test coverage rather than deleting assertions.`,
            });
          }
        }
      }
    }
  }

  return violations;
}
