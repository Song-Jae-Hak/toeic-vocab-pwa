import test from 'node:test';
import assert from 'node:assert/strict';
import { audioUrl, parseManifest, loadAudioBlob } from '../src/audio.js';

test('audioUrl points at audio/<id>.mp3', () => {
  assert.equal(audioUrl(42), 'audio/42.mp3');
});

test('parseManifest returns a set of positive integer ids and ignores junk', () => {
  assert.deepEqual([...parseManifest([1, 2, 3])], [1, 2, 3]);
  assert.deepEqual([...parseManifest([1, 'x', -4, 2.5, null, 7])], [1, 7]);
  assert.equal(parseManifest('nope').size, 0);
  assert.equal(parseManifest(null).size, 0);
});

function fakeCache() {
  const store = new Map();
  return {
    store,
    match: async (url) => store.get(url),
    put: async (url, res) => { store.set(url, res); },
  };
}
const blobRes = (text, ok = true, status = 200) => ({ ok, status, clone() { return this; }, blob: async () => `blob:${text}` });

test('loadAudioBlob returns the cached copy without hitting the network', async () => {
  const cache = fakeCache();
  cache.store.set('audio/1.mp3', blobRes('cached'));
  let fetched = 0;
  const b = await loadAudioBlob(1, { cache, fetchImpl: async () => { fetched++; return blobRes('net'); } });
  assert.equal(b, 'blob:cached');
  assert.equal(fetched, 0);
});

test('loadAudioBlob fetches, stores in the cache and returns the blob on a miss', async () => {
  const cache = fakeCache();
  const b = await loadAudioBlob(2, { cache, fetchImpl: async () => blobRes('net') });
  assert.equal(b, 'blob:net');
  assert.ok(cache.store.has('audio/2.mp3'));
});

test('loadAudioBlob returns null for a missing file or a network failure and caches nothing', async () => {
  const cache = fakeCache();
  assert.equal(await loadAudioBlob(3, { cache, fetchImpl: async () => blobRes('', false, 404) }), null);
  assert.equal(await loadAudioBlob(4, { cache, fetchImpl: async () => { throw new Error('offline'); } }), null);
  assert.equal(cache.store.size, 0);
});

test('loadAudioBlob still works when the Cache API is unavailable', async () => {
  assert.equal(await loadAudioBlob(5, { cache: null, fetchImpl: async () => blobRes('net') }), 'blob:net');
});
