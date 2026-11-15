import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_COUNT, UNKNOWN_INDEX, todayString, ensureTodaySession,
  currentIndex, recordAnswer, progress,
} from '../src/session.js';
import { emptyState } from '../src/storage.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}

const words = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, en: `w${i + 1}`, pos: 'n', ko: `뜻${i + 1}` }));

const day1 = new Date(2026, 10, 15, 9, 0);
const day2 = new Date(2026, 10, 16, 0, 5);

test('DAILY_COUNT is 300 and UNKNOWN_INDEX is 4', () => {
  assert.equal(DAILY_COUNT, 300);
  assert.equal(UNKNOWN_INDEX, 4);
});

test('todayString uses local YYYY-MM-DD', () => {
  assert.equal(todayString(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('a new session has 300 distinct ids and today\'s date', () => {
  const s = ensureTodaySession(emptyState(), words(1000), day1, lcg(1)).session;
  assert.equal(s.ids.length, 300);
  assert.equal(new Set(s.ids).size, 300);
  assert.equal(s.date, '2026-11-15');
});

test('calling again on the same day keeps the same ids', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const b = ensureTodaySession(a, words(1000), day1, lcg(99));
  assert.deepEqual(b.session.ids, a.session.ids);
});

test('next day starts a new session without carrying answers over', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const answered = recordAnswer(a, a.session.ids[0], 0, true);
  const b = ensureTodaySession(answered, words(1000), day2, lcg(2));
  assert.equal(b.session.date, '2026-11-16');
  assert.deepEqual(b.session.answers, {});
});

test('fewer than 300 words gives a session with all of them', () => {
  const s = ensureTodaySession(emptyState(), words(100), day1, lcg(1)).session;
  assert.equal(s.ids.length, 100);
});

test('words with high weight are drawn into the session much more often', () => {
  const ws = words(1000);
  const base = { ...emptyState(), weights: { 1: 10 } };
  let heavy = 0;
  let light = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = ensureTodaySession(base, ws, day1, lcg(seed)).session;
    if (s.ids.includes(1)) heavy++;
    if (s.ids.includes(2)) light++;
  }
  assert.ok(heavy >= light * 2, `heavy ${heavy} light ${light}`);
});

test('weights missing for a word id are treated as the default', () => {
  const state = { ...emptyState(), weights: { 99999: 5 } };
  const s = ensureTodaySession(state, words(500), day1, lcg(3)).session;
  assert.equal(s.ids.length, 300);
});

test('recordAnswer records only the first answer for a word', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const id = a.session.ids[0];
  const once = recordAnswer(a, id, 1, false);
  const twice = recordAnswer(once, id, 0, true);
  assert.deepEqual(twice.session.answers[id], { chosen: 1, correct: false });
  assert.equal(twice.weights[id], 3);
});

test('recording an id that is not in today\'s session changes nothing', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const outside = [...Array(1000).keys()].map((i) => i + 1).find((i) => !a.session.ids.includes(i));
  assert.deepEqual(recordAnswer(a, outside, 0, true), a);
});

test('choosing 모르겠다 is recorded as wrong and raises the weight', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const id = a.session.ids[0];
  const r = recordAnswer(a, id, UNKNOWN_INDEX, true);
  assert.deepEqual(r.session.answers[id], { chosen: 4, correct: false });
  assert.equal(r.weights[id], 3);
});

test('currentIndex and progress follow the answers', () => {
  let st = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  assert.equal(currentIndex(st.session), 0);
  st = recordAnswer(st, st.session.ids[0], 0, true);
  st = recordAnswer(st, st.session.ids[1], 1, false);
  st = recordAnswer(st, st.session.ids[2], 4, false);
  assert.equal(currentIndex(st.session), 3);
  assert.deepEqual(progress(st.session), { done: 3, total: 300, correct: 1, wrong: 2 });
});

test('currentIndex equals ids.length once everything is answered', () => {
  let st = ensureTodaySession(emptyState(), words(5), day1, lcg(1));
  for (const id of st.session.ids) st = recordAnswer(st, id, 0, true);
  assert.equal(currentIndex(st.session), 5);
});
