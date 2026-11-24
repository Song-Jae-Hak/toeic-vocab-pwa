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

import { shouldStartNewSession } from '../src/session.js';

test('shouldStartNewSession: same day never starts a new session', () => {
  const st = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  assert.equal(shouldStartNewSession(st, day1, { finished: true, hiddenMs: 9e9 }), false);
});

test('shouldStartNewSession: new day + finished screen starts one', () => {
  const st = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  assert.equal(shouldStartNewSession(st, day2, { finished: true, hiddenMs: 0 }), true);
});

test('shouldStartNewSession: new day after a long absence starts one even if unfinished', () => {
  const st = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  assert.equal(shouldStartNewSession(st, day2, { finished: false, hiddenMs: 2 * 3600 * 1000 }), true);
});

test('shouldStartNewSession: new day during an active sitting does not interrupt it', () => {
  const st = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  assert.equal(shouldStartNewSession(st, day2, { finished: false, hiddenMs: 60 * 1000 }), false);
});

test('shouldStartNewSession: no session yet starts one', () => {
  assert.equal(shouldStartNewSession(emptyState(), day1, { finished: false, hiddenMs: 0 }), true);
});

import { DAILY_COUNT_OPTIONS, setDailyCount } from '../src/session.js';

test('DAILY_COUNT_OPTIONS are 100..500 in steps of 100', () => {
  assert.deepEqual(DAILY_COUNT_OPTIONS, [100, 200, 300, 400, 500]);
});

test('a new session uses state.settings.dailyCount', () => {
  const base = { ...emptyState(), settings: { dailyCount: 200 } };
  const s = ensureTodaySession(base, words(1000), day1, lcg(1)).session;
  assert.equal(s.ids.length, 200);
});

test('state without settings still uses 300', () => {
  const { settings, ...legacy } = emptyState();
  const s = ensureTodaySession(legacy, words(1000), day1, lcg(1)).session;
  assert.equal(s.ids.length, 300);
});

function withAnswers(n) {
  let st = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  for (let i = 0; i < n; i++) st = recordAnswer(st, st.session.ids[i], 0, true);
  return st;
}

test('setDailyCount shrinks today\'s session but keeps every answered word, in order', () => {
  const st = withAnswers(50);
  const out = setDailyCount(st, words(1000), 200, lcg(2));
  assert.equal(out.settings.dailyCount, 200);
  assert.equal(out.session.ids.length, 200);
  assert.deepEqual(out.session.ids.slice(0, 50), st.session.ids.slice(0, 50));
  assert.equal(Object.keys(out.session.answers).length, 50);
  assert.equal(currentIndex(out.session), 50);
});

test('setDailyCount grows the session with new distinct words and keeps old ones', () => {
  const st = withAnswers(10);
  const out = setDailyCount(st, words(1000), 500, lcg(3));
  assert.equal(out.session.ids.length, 500);
  assert.equal(new Set(out.session.ids).size, 500);
  assert.deepEqual(out.session.ids.slice(0, 300), st.session.ids);
});

test('setDailyCount below the number already answered ends today\'s session at what was answered', () => {
  const st = withAnswers(150);
  const out = setDailyCount(st, words(1000), 100, lcg(4));
  assert.equal(out.settings.dailyCount, 100);
  assert.equal(out.session.ids.length, 150);
  assert.equal(currentIndex(out.session), 150);
});

test('setDailyCount ignores values that are not offered', () => {
  const st = withAnswers(5);
  assert.deepEqual(setDailyCount(st, words(1000), 250, lcg(5)), st);
  assert.deepEqual(setDailyCount(st, words(1000), 999, lcg(5)), st);
});

test('the chosen count is used again the next day', () => {
  const st = setDailyCount(withAnswers(5), words(1000), 100, lcg(6));
  const next = ensureTodaySession(st, words(1000), day2, lcg(7));
  assert.equal(next.session.ids.length, 100);
});

test('recordAnswer updates the long-term stats once per word, with the session date', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const id = a.session.ids[0];
  const r1 = recordAnswer(a, id, 0, true);
  assert.deepEqual(r1.stats.words[id], { right: 1, wrong: 0, streak: 1 });
  assert.deepEqual(r1.stats.days['2026-11-15'], { n: 1, right: 1 });
  const r2 = recordAnswer(r1, id, 1, false); // repeated answer is ignored
  assert.deepEqual(r2.stats, r1.stats);
});

test('모르겠다 counts as wrong in the stats', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const id = a.session.ids[0];
  const r = recordAnswer(a, id, UNKNOWN_INDEX, true);
  assert.deepEqual(r.stats.words[id], { right: 0, wrong: 1, streak: 0 });
});

import { pruneSession } from '../src/session.js';

test('pruneSession drops words that no longer exist from today\'s session and keeps the rest in order', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const gone = a.session.ids[5];
  const kept = words(1000).filter((w) => w.id !== gone);
  const out = pruneSession(a, kept);
  assert.equal(out.session.ids.length, 299);
  assert.deepEqual(out.session.ids, a.session.ids.filter((id) => id !== gone));
  assert.deepEqual(out.weights, a.weights);
});

test('pruneSession does not count a removed word as wrong or change any weight', () => {
  let a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  a = recordAnswer(a, a.session.ids[0], 0, true);
  const gone = a.session.ids[3];
  const out = pruneSession(a, words(1000).filter((w) => w.id !== gone));
  assert.deepEqual(progress(out.session), { done: 1, total: 299, correct: 1, wrong: 0 });
  assert.equal(out.weights[gone], undefined);
  assert.equal(out.stats.words[gone], undefined);
});

test('pruneSession leaves an untouched state alone and handles a missing session', () => {
  const a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  assert.equal(pruneSession(a, words(1000)), a);
  const empty = emptyState();
  assert.equal(pruneSession(empty, words(10)), empty);
});

test('pruneSession keeps already answered ids even if their word was removed (history stays consistent)', () => {
  let a = ensureTodaySession(emptyState(), words(1000), day1, lcg(1));
  const id = a.session.ids[0];
  a = recordAnswer(a, id, 0, true);
  const out = pruneSession(a, words(1000).filter((w) => w.id !== id));
  assert.equal(out.session.ids.includes(id), true);
  assert.equal(out.session.answers[id].correct, true);
});

import { setHideMastered } from '../src/session.js';

// Marks every id in `ids` as learned (answered right 3 times in a row).
function mastered(st, ids) {
  const w = { ...st.stats.words };
  for (const id of ids) w[id] = { right: 3, wrong: 0, streak: 3 };
  return { ...st, stats: { ...st.stats, words: w } };
}

test('with hideMastered on, a new session leaves out learned words', () => {
  let st = mastered(emptyState(), Array.from({ length: 890 }, (_, i) => i + 1));
  st = { ...st, settings: { ...st.settings, hideMastered: true } };
  const s = ensureTodaySession(st, words(1000), day1, lcg(1)).session;
  assert.deepEqual([...s.ids].sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => 891 + i));
});

test('with hideMastered off, mastered words are still asked', () => {
  const st = mastered(emptyState(), Array.from({ length: 1000 }, (_, i) => i + 1));
  assert.equal(ensureTodaySession(st, words(1000), day1, lcg(1)).session.ids.length, 300);
});

test('turning hideMastered on mid-day swaps unanswered mastered words for others, keeping answered ones', () => {
  const st0 = withAnswers(10);
  const answered = st0.session.ids.slice(0, 10);
  const unansweredMastered = st0.session.ids.slice(10, 60);
  const st = mastered(st0, [...answered, ...unansweredMastered]);
  const out = setHideMastered(st, words(1000), true, lcg(8));
  assert.equal(out.settings.hideMastered, true);
  assert.equal(out.session.ids.length, 300);
  assert.equal(new Set(out.session.ids).size, 300);
  assert.deepEqual(out.session.ids.slice(0, 10), answered);
  for (const id of unansweredMastered) assert.ok(!out.session.ids.includes(id));
  assert.equal(currentIndex(out.session), 10);
});

test('turning hideMastered off keeps today\'s questions as they are', () => {
  const st = { ...withAnswers(10), settings: { ...withAnswers(10).settings, hideMastered: true } };
  const out = setHideMastered(st, words(1000), false, lcg(9));
  assert.equal(out.settings.hideMastered, false);
  assert.deepEqual(out.session.ids, st.session.ids);
});

test('setHideMastered ignores values that are not booleans', () => {
  const st = withAnswers(5);
  assert.deepEqual(setHideMastered(st, words(1000), 'yes', lcg(10)), st);
});

test('setDailyCount tops up only with unmastered words when hideMastered is on', () => {
  let st = withAnswers(10);
  const taken = new Set(st.session.ids);
  const free = words(900).map((w) => w.id).filter((id) => !taken.has(id));
  st = mastered(st, free.slice(0, 400));
  st = { ...st, settings: { ...st.settings, hideMastered: true } };
  const out = setDailyCount(st, words(1000), 500, lcg(11));
  const added = out.session.ids.slice(300);
  assert.equal(added.length, 200);
  assert.deepEqual([...added].sort((a, b) => a - b), free.slice(400));
});
