import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLE_SIZE, bundleCount, clampBundle, bundleIds, bundleProgress, studyPools,
} from '../src/bundles.js';
import { ensureTodaySession, setBundle } from '../src/session.js';
import { emptyState } from '../src/storage.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}
const words = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, en: `w${i + 1}`, pos: 'n', ko: `뜻${i + 1}` }));
const day1 = new Date(2026, 10, 15, 9, 0);
const learned = { right: 3, wrong: 0, streak: 3 };
const seenNotLearned = { right: 1, wrong: 1, streak: 0 };

function withStats(wordStats, bundle = 0) {
  const st = emptyState();
  return { ...st, settings: { ...st.settings, bundle }, stats: { ...st.stats, words: wordStats } };
}

test('words split into bundles of 900 in id order; the last bundle holds the rest', () => {
  assert.equal(BUNDLE_SIZE, 900);
  assert.equal(bundleCount(words(5353)), 6);
  assert.equal(bundleCount([]), 1);
  const shuffled = [...words(2000)].reverse();
  assert.deepEqual(bundleIds(shuffled, 0).slice(0, 3), [1, 2, 3]);
  assert.equal(bundleIds(words(5353), 5).length, 853);
  assert.equal(clampBundle(words(5353), 9), 5);
  assert.equal(clampBundle(words(5353), -1), 0);
});

test('bundleProgress counts learned words and offers the next bundle from 80%', () => {
  const ws = {};
  for (let id = 1; id <= 719; id++) ws[id] = learned;
  const below = bundleProgress(withStats(ws), words(1800), 0);
  assert.deepEqual(below, { mastered: 719, total: 900, ratio: 719 / 900, canAdvance: false });
  ws[720] = learned;
  assert.equal(bundleProgress(withStats(ws), words(1800), 0).canAdvance, true);
  // no next bundle to offer after the last one
  const all = {};
  for (let id = 901; id <= 1800; id++) all[id] = learned;
  assert.equal(bundleProgress(withStats(all), words(1800), 1).canAdvance, false);
});

test('studyPools: current bundle plus unlearned leftovers studied, learned earlier words for review', () => {
  const st = withStats({ 1: learned, 2: seenNotLearned, 1000: seenNotLearned }, 1);
  const { main, review } = studyPools(st, words(2700));
  assert.deepEqual(review, [1]);
  assert.ok(main.includes(2)); // seen in bundle 1, not learned: carried along
  assert.ok(!main.includes(3)); // never seen in bundle 1: left behind
  assert.ok(main.includes(901) && main.includes(1800) && !main.includes(1801));
  assert.equal(main.length, 901);
});

test('a session picks only from the current bundle when nothing earlier is learned', () => {
  const s = ensureTodaySession(withStats({}, 2), words(5353), day1, lcg(1)).session;
  assert.equal(s.ids.length, 300);
  assert.ok(s.ids.every((id) => id >= 1801 && id <= 2700));
});

test('about 10% of a session reviews learned words of earlier bundles', () => {
  const ws = {};
  for (let id = 1; id <= 900; id++) ws[id] = learned;
  const s = ensureTodaySession(withStats(ws, 1), words(1800), day1, lcg(2)).session;
  assert.equal(s.ids.length, 300);
  assert.equal(new Set(s.ids).size, 300);
  assert.equal(s.ids.filter((id) => id <= 900).length, 30);
  // review words are mixed in, not all at the end
  assert.ok(s.ids.slice(0, 150).some((id) => id <= 900));
});

test('setBundle keeps answered questions and re-picks the rest from the new bundle', () => {
  let st = ensureTodaySession(emptyState(), words(1800), day1, lcg(3));
  const answered = st.session.ids.slice(0, 5);
  const answers = Object.fromEntries(answered.map((id) => [id, { chosen: 0, correct: true }]));
  st = { ...st, session: { ...st.session, answers } };
  const out = setBundle(st, words(1800), 1, lcg(4));
  assert.equal(out.settings.bundle, 1);
  assert.equal(out.session.ids.length, 300);
  assert.deepEqual(out.session.ids.slice(0, 5), answered);
  assert.ok(out.session.ids.slice(5).every((id) => id > 900));
});

test('setBundle ignores bundles that do not exist', () => {
  const st = ensureTodaySession(emptyState(), words(1800), day1, lcg(5));
  assert.equal(setBundle(st, words(1800), 2, lcg(6)), st);
  assert.equal(setBundle(st, words(1800), 'x', lcg(6)), st);
});
