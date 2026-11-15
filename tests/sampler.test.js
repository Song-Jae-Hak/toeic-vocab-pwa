import test from 'node:test';
import assert from 'node:assert/strict';
import { weightedSample } from '../src/sampler.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}

const items = Array.from({ length: 100 }, (_, i) => i + 1);

test('returns n distinct items that all come from the input', () => {
  const out = weightedSample(items, () => 1, 30, lcg(1));
  assert.equal(out.length, 30);
  assert.equal(new Set(out).size, 30);
  assert.ok(out.every((x) => items.includes(x)));
});

test('returns every item when n exceeds the pool', () => {
  const out = weightedSample([1, 2, 3], () => 1, 10, lcg(2));
  assert.deepEqual([...out].sort(), [1, 2, 3]);
});

test('heavier items are drawn much more often', () => {
  const weightOf = (id) => (id === 1 ? 10 : 1);
  const rng = lcg(42);
  let hit1 = 0;
  let hit2 = 0;
  for (let i = 0; i < 2000; i++) {
    const out = weightedSample(items, weightOf, 10, rng);
    if (out.includes(1)) hit1++;
    if (out.includes(2)) hit2++;
  }
  assert.ok(hit1 / 2000 >= 0.5, `heavy item rate ${hit1 / 2000}`);
  assert.ok(hit1 > hit2 * 3, `heavy ${hit1} vs light ${hit2}`);
});
