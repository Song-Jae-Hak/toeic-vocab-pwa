import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, loadState, saveState, exportState, importState } from '../src/storage.js';

function fakeStore(initial) {
  const data = new Map(initial ? Object.entries(initial) : []);
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, v),
  };
}

const sample = {
  version: 1,
  settings: { dailyCount: 200, autoNext: true, autoPlay: true, fontSize: 'large', theme: 'dark' },
  stats: { words: { 1: { right: 2, wrong: 1 } }, days: { '2026-11-15': { n: 3, right: 2 } } },
  weights: { 1: 3, 5: 0.8 },
  session: {
    date: '2026-11-15',
    ids: [1, 2, 3],
    answers: { 1: { chosen: 2, correct: true } },
  },
};

test('save then load round-trips the state', () => {
  const store = fakeStore();
  assert.equal(saveState(store, sample), true);
  assert.deepEqual(loadState(store), sample);
});

test('missing data yields an empty state', () => {
  assert.deepEqual(loadState(fakeStore()), emptyState());
});

test('getItem that throws yields an empty state', () => {
  const store = { getItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadState(store), emptyState());
});

test('corrupt JSON yields an empty state', () => {
  const store = fakeStore({ 'toeic-vocab-v1': '{깨진' });
  assert.deepEqual(loadState(store), emptyState());
});

test('structurally wrong JSON yields an empty state', () => {
  const store = fakeStore({ 'toeic-vocab-v1': '{"version":1,"weights":"x","session":null}' });
  assert.deepEqual(loadState(store), emptyState());
});

test('setItem that throws makes saveState return false', () => {
  const store = { setItem() { throw new Error('quota'); } };
  assert.equal(saveState(store, sample), false);
});

test('export then import round-trips', () => {
  const res = importState(exportState(sample));
  assert.equal(res.ok, true);
  assert.deepEqual(res.state, sample);
});

test('import rejects non-JSON text', () => {
  assert.equal(importState('hello').ok, false);
});

test('import rejects a different version', () => {
  assert.equal(importState('{"version":2,"weights":{},"session":null}').ok, false);
});

test('import rejects non-numeric weights', () => {
  assert.equal(importState('{"version":1,"weights":{"1":"a"},"session":null}').ok, false);
  assert.equal(importState('{"version":1,"weights":"x","session":null}').ok, false);
});

test('import rejects a malformed session', () => {
  assert.equal(importState('{"version":1,"weights":{},"session":{"date":1}}').ok, false);
});

test('an older saved state without settings loads with the default dailyCount 300', () => {
  const store = fakeStore({ 'toeic-vocab-v1': JSON.stringify({ version: 1, weights: { 1: 2 }, session: null }) });
  const s = loadState(store);
  assert.equal(s.settings.dailyCount, 300);
  assert.deepEqual(s.weights, { 1: 2 });
});

test('emptyState has the default dailyCount 300', () => {
  assert.equal(emptyState().settings.dailyCount, 300);
});

test('import accepts a file without settings and fills the default', () => {
  const res = importState('{"version":1,"weights":{},"session":null}');
  assert.equal(res.ok, true);
  assert.equal(res.state.settings.dailyCount, 300);
});

test('import rejects an unsupported dailyCount', () => {
  assert.equal(importState('{"version":1,"settings":{"dailyCount":250},"weights":{},"session":null}').ok, false);
  assert.equal(importState('{"version":1,"settings":{"dailyCount":"200"},"weights":{},"session":null}').ok, false);
  assert.equal(importState('{"version":1,"settings":5,"weights":{},"session":null}').ok, false);
});

test('older saved state gets defaults for the newer settings and stats', () => {
  const store = fakeStore({ 'toeic-vocab-v1': JSON.stringify({ version: 1, settings: { dailyCount: 100 }, weights: {}, session: null }) });
  const s = loadState(store);
  assert.deepEqual(s.settings, { dailyCount: 100, autoNext: false, autoPlay: false, fontSize: 'normal', theme: 'system' });
  assert.deepEqual(s.stats, { words: {}, days: {} });
});

test('import rejects invalid autoNext, fontSize and theme values', () => {
  const base = (settings) => JSON.stringify({ version: 1, settings, weights: {}, session: null });
  assert.equal(importState(base({ autoNext: 'yes' })).ok, false);
  assert.equal(importState(base({ fontSize: 'huge' })).ok, false);
  assert.equal(importState(base({ theme: 'blue' })).ok, false);
  assert.equal(importState(base({ autoNext: true, fontSize: 'xlarge', theme: 'light' })).ok, true);
});

test('import rejects malformed stats', () => {
  const base = (stats) => JSON.stringify({ version: 1, stats, weights: {}, session: null });
  assert.equal(importState(base('x')).ok, false);
  assert.equal(importState(base({ words: { 1: { right: -1, wrong: 0 } }, days: {} })).ok, false);
  assert.equal(importState(base({ words: {}, days: { d: { n: 'a', right: 0 } } })).ok, false);
  assert.equal(importState(base({ words: {}, days: {} })).ok, true);
});

test('import rejects a non-boolean autoPlay', () => {
  assert.equal(importState('{"version":1,"settings":{"autoPlay":"yes"},"weights":{},"session":null}').ok, false);
  assert.equal(importState('{"version":1,"settings":{"autoPlay":true},"weights":{},"session":null}').ok, true);
});

test('import accepts the small font size', () => {
  assert.equal(importState('{"version":1,"settings":{"fontSize":"small"},"weights":{},"session":null}').ok, true);
});
