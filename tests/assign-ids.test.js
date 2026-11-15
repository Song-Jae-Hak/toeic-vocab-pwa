import test from 'node:test';
import assert from 'node:assert/strict';
import { assignIds } from '../tools/assign-ids.mjs';

const w = (en) => ({ en, pos: 'n', ko: '뜻' });

test('first run numbers words 1..n in order', () => {
  const out = assignIds([w('a'), w('b'), w('c')], []);
  assert.deepEqual(out.map((x) => [x.en, x.id]), [['a', 1], ['b', 2], ['c', 3]]);
});

test('existing words keep their ids even when a word before them is removed', () => {
  const existing = [{ ...w('a'), id: 1 }, { ...w('b'), id: 2 }, { ...w('c'), id: 3 }];
  const out = assignIds([w('a'), w('c')], existing);
  assert.deepEqual(out.map((x) => [x.en, x.id]), [['a', 1], ['c', 3]]);
});

test('new words get ids above the largest id ever used and never reuse a removed id', () => {
  const existing = [{ ...w('a'), id: 1 }, { ...w('b'), id: 2 }, { ...w('c'), id: 3 }];
  const out = assignIds([w('a'), w('c'), w('d'), w('e')], existing);
  assert.deepEqual(out.map((x) => [x.en, x.id]), [['a', 1], ['c', 3], ['d', 4], ['e', 5]]);
});

test('matching is case-insensitive on en', () => {
  const out = assignIds([w('Alpha')], [{ ...w('alpha'), id: 9 }]);
  assert.equal(out[0].id, 9);
});
