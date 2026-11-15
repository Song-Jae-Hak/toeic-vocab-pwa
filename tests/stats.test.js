import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, recordStat, summary, topWrong } from '../src/stats.js';

test('emptyStats starts empty', () => {
  assert.deepEqual(emptyStats(), { words: {}, days: {} });
});

test('recordStat counts per word and per day without mutating the input', () => {
  const s0 = Object.freeze(emptyStats());
  const s1 = recordStat(s0, 7, true, '2026-11-15');
  const s2 = recordStat(s1, 7, false, '2026-11-15');
  const s3 = recordStat(s2, 9, false, '2026-11-16');
  assert.deepEqual(s3.words[7], { right: 1, wrong: 1 });
  assert.deepEqual(s3.words[9], { right: 0, wrong: 1 });
  assert.deepEqual(s3.days['2026-11-15'], { n: 2, right: 1 });
  assert.deepEqual(s3.days['2026-11-16'], { n: 1, right: 0 });
  assert.deepEqual(s0, { words: {}, days: {} });
});

function build(entries) {
  let s = emptyStats();
  for (const [date, id, ok] of entries) s = recordStat(s, id, ok, date);
  return s;
}

test('summary of an empty history', () => {
  assert.deepEqual(summary(emptyStats(), '2026-11-15'), { totalAnswered: 0, accuracy: 0, streak: 0, daysStudied: 0 });
});

test('summary totals, accuracy percent and days studied', () => {
  const s = build([['2026-11-13', 1, true], ['2026-11-13', 2, false], ['2026-11-15', 3, true], ['2026-11-15', 4, true]]);
  const r = summary(s, '2026-11-15');
  assert.equal(r.totalAnswered, 4);
  assert.equal(r.accuracy, 75);
  assert.equal(r.daysStudied, 2);
});

test('streak counts consecutive days ending today', () => {
  const s = build([['2026-11-13', 1, true], ['2026-11-14', 1, true], ['2026-11-15', 1, true]]);
  assert.equal(summary(s, '2026-11-15').streak, 3);
});

test('streak is not broken just because today has no answers yet', () => {
  const s = build([['2026-11-13', 1, true], ['2026-11-14', 1, true]]);
  assert.equal(summary(s, '2026-11-15').streak, 2);
});

test('streak resets after a missed day, across month ends', () => {
  const s = build([['2026-10-30', 1, true], ['2026-10-31', 1, true], ['2026-11-01', 1, true], ['2026-11-03', 1, true]]);
  assert.equal(summary(s, '2026-11-03').streak, 1);
  const t = build([['2026-10-30', 1, true], ['2026-10-31', 1, true], ['2026-11-01', 1, true]]);
  assert.equal(summary(t, '2026-11-01').streak, 3);
});

test('topWrong sorts by wrong count, skips never-wrong words and respects the limit', () => {
  const s = build([
    ['2026-11-15', 1, false], ['2026-11-15', 1, false], ['2026-11-15', 1, true],
    ['2026-11-15', 2, false],
    ['2026-11-15', 3, true],
    ['2026-11-15', 4, false], ['2026-11-15', 4, false], ['2026-11-15', 4, false],
  ]);
  assert.deepEqual(topWrong(s, 2), [{ id: 4, wrong: 3, right: 0 }, { id: 1, wrong: 2, right: 1 }]);
  assert.equal(topWrong(s, 10).some((w) => w.id === 3), false);
});

test('topWrong breaks ties on wrong count by lower accuracy', () => {
  // word 1: wrong 1, right 2 (67% right); word 2: wrong 1, right 0 (0% right)
  const s = build([['d', 1, false], ['d', 1, true], ['d', 1, true], ['d', 2, false]]);
  assert.deepEqual(topWrong(s, 5).map((w) => w.id), [2, 1]);
});
