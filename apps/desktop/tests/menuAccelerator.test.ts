import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { acceleratorPayload, MENU_ACCELERATOR_PAYLOAD } from '../src/main/menuAccelerator.ts';
import {
  createAcceleratorEchoFilter,
  MENU_ACCELERATOR_PAYLOAD as RENDERER_PAYLOAD,
} from '../src/renderer/src/features/editor-ir/shortcutGuards.ts';

/**
 * Ctrl/Cmd+S、Ctrl/Cmd+N 等「渲染进程 keydown 也处理」的菜单项：主进程把加速键触发的点击标成
 * `accelerator`，渲染进程把它和自己处理过的那次按键配对丢掉，不再靠 300ms 时间窗。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const mainIndex = fs.readFileSync(path.join(here, '..', 'src', 'main', 'index.ts'), 'utf8');

test('主进程：加速键触发的点击带 accelerator 标记，鼠标点击不带', () => {
  assert.equal(acceleratorPayload({ triggeredByAccelerator: true }), MENU_ACCELERATOR_PAYLOAD);
  assert.equal(acceleratorPayload({ triggeredByAccelerator: false }), undefined);
  assert.equal(acceleratorPayload(undefined), undefined);
});

test('主进程与渲染进程用同一个标记字符串', () => {
  assert.equal(MENU_ACCELERATOR_PAYLOAD, RENDERER_PAYLOAD);
});

test('渲染进程也处理按键的五个菜单项都带上加速键标记', () => {
  const items: Array<[string, string]> = [
    ["accelerator: 'CmdOrCtrl+N'", 'file:new'],
    ["accelerator: 'CmdOrCtrl+S'", 'file:save'],
    ["accelerator: 'CmdOrCtrl+F'", 'editor:find'],
    ["accelerator: 'CmdOrCtrl+Shift+L'", 'view:toggleSidebar'],
    ["accelerator: 'Cmd+,'", 'view:settings'],
  ];
  for (const [accel, action] of items) {
    const line = mainIndex.split('\n').find((l) => l.includes(accel));
    assert.ok(line, `菜单里找不到 ${accel}`);
    assert.ok(
      line.includes(`sendMenuAction('${action}', acceleratorPayload(`),
      `${accel} 的点击要用 acceleratorPayload 标记：${line.trim()}`
    );
  }
});

test('回声过滤：每次按键只吞掉一份加速键回声，不管它晚到多久（窗口内）', () => {
  let now = 0;
  const f = createAcceleratorEchoFilter(5000, () => now);
  f.noteKeystroke('file:new');
  now = 900;
  assert.equal(f.isEcho('file:new', MENU_ACCELERATOR_PAYLOAD), true);
  assert.equal(f.isEcho('file:new', MENU_ACCELERATOR_PAYLOAD), false, '第二份没有对应按键，照常执行');
});

test('回声过滤：没有标记（鼠标点菜单）永远不吞；不同动作互不影响', () => {
  const f = createAcceleratorEchoFilter(5000, () => 0);
  f.noteKeystroke('file:save');
  assert.equal(f.isEcho('file:save', undefined), false);
  assert.equal(f.isEcho('file:new', MENU_ACCELERATOR_PAYLOAD), false);
  assert.equal(f.isEcho('file:save', MENU_ACCELERATOR_PAYLOAD), true);
});

test('回声过滤：两次按键对两份回声；超出窗口的旧按键不再吞后来的加速键', () => {
  let now = 0;
  const f = createAcceleratorEchoFilter(5000, () => now);
  f.noteKeystroke('file:new');
  now = 400;
  f.noteKeystroke('file:new');
  now = 800;
  assert.equal(f.isEcho('file:new', MENU_ACCELERATOR_PAYLOAD), true);
  assert.equal(f.isEcho('file:new', MENU_ACCELERATOR_PAYLOAD), true);
  assert.equal(f.isEcho('file:new', MENU_ACCELERATOR_PAYLOAD), false);

  f.noteKeystroke('file:save');
  now = 800 + 5001;
  assert.equal(f.isEcho('file:save', MENU_ACCELERATOR_PAYLOAD), false);
});
