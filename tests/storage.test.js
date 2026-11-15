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
