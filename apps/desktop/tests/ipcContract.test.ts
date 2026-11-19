import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS,
  verifyIpcParity,
} from '../../../packages/shared/src/ipcContract.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const SHARED_INDEX = path.join(REPO_ROOT, 'packages/shared/src/index.ts');
const PRELOAD_INDEX = path.join(REPO_ROOT, 'apps/desktop/src/preload/index.ts');
const MAIN_DIR = path.join(REPO_ROOT, 'apps/desktop/src/main');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function resolveChannelExpr(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const objName = node.expression.text;
    const key = node.name.text;
    if (objName === 'IPC_INVOKE_CHANNELS' && key in IPC_INVOKE_CHANNELS) {
      return IPC_INVOKE_CHANNELS[key as keyof typeof IPC_INVOKE_CHANNELS];
    }
    if (objName === 'IPC_SEND_CHANNELS' && key in IPC_SEND_CHANNELS) {
      return IPC_SEND_CHANNELS[key as keyof typeof IPC_SEND_CHANNELS];
    }
    if (objName === 'IPC_EVENT_CHANNELS' && key in IPC_EVENT_CHANNELS) {
      return IPC_EVENT_CHANNELS[key as keyof typeof IPC_EVENT_CHANNELS];
    }
  }
  return null;
}

function extractElectronApiMethods(filePath: string): string[] {
  const sf = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const methods: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'ElectronAPI') {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)) {
          methods.push(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return methods;
}

function extractIpcCalls(
  filePaths: readonly string[],
  receiverName: string,
  methodNames: readonly string[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const m of methodNames) result[m] = [];

  for (const filePath of filePaths) {
    const sf = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const expr = node.expression;
        if (
          ts.isIdentifier(expr.expression) &&
          expr.expression.text === receiverName &&
          methodNames.includes(expr.name.text) &&
          node.arguments.length > 0
        ) {
          const channel = resolveChannelExpr(node.arguments[0]);
          assert.ok(channel, `Unresolvable IPC channel in ${filePath}: ${node.arguments[0].getText(sf)}`);
          result[expr.name.text].push(channel);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return result;
}

test('Main <-> Preload <-> Shared ElectronAPI IPC channels are strictly 1:1 aligned', () => {
  const electronApiMethods = extractElectronApiMethods(SHARED_INDEX);
  assert.ok(electronApiMethods.length >= 30, 'Expected ElectronAPI methods in shared index.ts');

  const preloadCalls = extractIpcCalls([PRELOAD_INDEX], 'ipcRenderer', ['invoke', 'send', 'on']);
  const mainFiles = walkTsFiles(MAIN_DIR);
  const mainCalls = extractIpcCalls(mainFiles, 'ipcMain', ['handle', 'on']);

  const report = verifyIpcParity({
    electronApiMethods,
    contractInvokeMap: IPC_INVOKE_CHANNELS,
    contractSendMap: IPC_SEND_CHANNELS,
    contractEventMap: IPC_EVENT_CHANNELS,
    preloadInvokeChannels: preloadCalls.invoke,
    preloadSendChannels: preloadCalls.send,
    preloadEventChannels: preloadCalls.on,
    mainHandleChannels: mainCalls.handle,
    mainOnChannels: mainCalls.on,
  });

  assert.deepEqual(report.errors, [], `IPC contract mismatch:\n${report.errors.join('\n')}`);
});

test('verifyIpcParity fails loudly when frontend method or main handler mismatches contract', () => {
  const broken = verifyIpcParity({
    electronApiMethods: ['selectWorkspace', 'ghostFrontendCall'],
    contractInvokeMap: { selectWorkspace: 'workspace:select' },
    contractSendMap: {},
    contractEventMap: {},
    preloadInvokeChannels: ['workspace:select'],
    preloadSendChannels: [],
    preloadEventChannels: [],
    mainHandleChannels: ['workspace:orphan'],
    mainOnChannels: [],
  });

  assert.equal(broken.ok, false);
  assert.ok(broken.errors.some((e) => e.includes('ghostFrontendCall')));
  assert.ok(broken.errors.some((e) => e.includes('workspace:select')));
  assert.ok(broken.errors.some((e) => e.includes('workspace:orphan')));
});
