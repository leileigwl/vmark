import assert from 'node:assert/strict';
import test from 'node:test';
import { PLATFORM_SPECS, SPEC_BY_ID } from '../src/renderer/src/features/publish-flow/platformSpecs.ts';
import {
  SPEC_EVIDENCE,
  SPEC_PENDING,
  specFieldValue,
  type SpecField,
} from '../src/renderer/src/features/publish-flow/platformSpecSources.ts';

const FIELDS: SpecField[] = [
  'title.max', 'title.min', 'digest.max', 'digest.min', 'digest.required',
  'cover.ratios', 'cover.mode', 'tags.max', 'tags.required', 'maxCards',
];

test('官方文档核实过的限制与 PLATFORM_SPECS 一致', () => {
  for (const [id, list] of Object.entries(SPEC_EVIDENCE)) {
    const spec = SPEC_BY_ID[id as keyof typeof SPEC_BY_ID];
    assert.ok(spec, `${id} 不在 PLATFORM_SPECS`);
    for (const e of list ?? []) {
      assert.deepEqual(specFieldValue(spec, e.field), e.value, `${id}.${e.field} 与官方文档 ${e.url} 不符`);
      assert.match(e.url, /^https:\/\//, `${id}.${e.field} 出处必须是 https 链接`);
    }
  }
});

test('官方文档给出的关键数值（核查日 2026-11-23）', () => {
  const v = (id: string, f: SpecField) => specFieldValue(SPEC_BY_ID[id as keyof typeof SPEC_BY_ID]!, f);
  assert.equal(v('weixin', 'digest.max'), 120);
  assert.deepEqual(v('weixin', 'cover.ratios'), ['2.35:1', '1:1']);
  assert.equal(v('weibo', 'title.max'), 32);
  assert.equal(v('weibo', 'digest.max'), 44);
  assert.equal(v('bilibili', 'title.max'), 40);
  assert.equal(v('baijiahao', 'title.min'), 8);
  assert.equal(v('xiaohongshu', 'title.max'), 20);
  assert.equal(v('xiaohongshu', 'digest.max'), 1000);
  assert.equal(v('xiaohongshu', 'maxCards'), 18);
  assert.equal(v('douyin', 'digest.max'), 1000);
});

test('每个平台出现的字段要么有官方出处，要么列在待核实清单里（附后台核实方法）', () => {
  for (const spec of PLATFORM_SPECS) {
    if (spec.kind === 'site') continue; // 自有静态站点，限制由我们自己定
    const proven = new Set((SPEC_EVIDENCE[spec.id] ?? []).map((e) => e.field));
    const pending = SPEC_PENDING[spec.id] ?? [];
    for (const p of pending) {
      assert.ok(!proven.has(p.field), `${spec.id}.${p.field} 不能同时“已核实”又“待核实”`);
      assert.ok(p.howToCheck.length > 0, `${spec.id}.${p.field} 缺后台核实方法`);
    }
    const pendingSet = new Set(pending.map((p) => p.field));
    for (const f of FIELDS) {
      if (specFieldValue(spec, f) === undefined) continue;
      assert.ok(proven.has(f) || pendingSet.has(f), `${spec.id}.${f} 既无出处也不在待核实清单`);
    }
  }
});

test('verified=true 只给待核实清单为空的平台', () => {
  for (const spec of PLATFORM_SPECS) {
    if (spec.kind === 'site') continue;
    const open = (SPEC_PENDING[spec.id] ?? []).map((p) => p.field);
    assert.equal(spec.verified, open.length === 0, `${spec.id} verified=${spec.verified}，待核实：${open.join(', ') || '无'}`);
  }
});
