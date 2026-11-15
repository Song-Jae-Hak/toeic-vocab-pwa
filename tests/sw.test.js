import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('sw.js', root), 'utf8');

function load({ offline = false } = {}) {
  const listeners = {};
  const store = new Map(); // cacheName -> Map(url -> response)
  const added = [];
  const caches = {
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      return {
        put: async (req, res) => { store.get(name).set(req.url, res); },
        addAll: async (urls) => { added.push(...urls); urls.forEach((u) => store.get(name).set(u, `cached:${u}`)); },
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (req) => {
      for (const c of store.values()) if (c.has(req.url)) return c.get(req.url);
      return undefined;
    },
  };
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const fetchCalls = [];
  const sandbox = { self, caches, fetch: async (req) => { if (offline) throw new Error('offline'); fetchCalls.push(req.url); return { ok: true, clone() { return this; }, body: `net:${req.url}`, toString() { return this.body; } }; }, URL };
  vm.runInNewContext(source, sandbox);
  const run = async (type, event) => {
    let p;
    listeners[type]({ ...event, waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; } });
    return p;
  };
  return { run, store, added, fetchCalls };
}

test('every cached asset exists on disk', () => {
  const m = source.match(/const ASSETS = \[([\s\S]*?)\];/);
  const assets = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((a) => a !== './');
  assert.ok(assets.length > 10);
  for (const a of assets) assert.ok(existsSync(new URL(a, root)), `missing asset: ${a}`);
});

test('install caches the whole asset list under toeic-vocab-v1', async () => {
  const sw = load();
  await sw.run('install', {});
  assert.ok(sw.store.has('toeic-vocab-v1'));
  assert.ok(sw.added.includes('data/words.json'));
  assert.ok(sw.added.includes('src/session.js'));
});

test('activate removes old app caches but keeps the current one and the audio cache', async () => {
  const sw = load();
  await sw.run('install', {});
  sw.store.set('toeic-vocab-v0', new Map());
  sw.store.set('toeic-audio-v1', new Map());
  await sw.run('activate', {});
  assert.deepEqual([...sw.store.keys()].sort(), ['toeic-audio-v1', 'toeic-vocab-v1']);
});

test('fetch is network-first: fresh response wins and refreshes the cache', async () => {
  const sw = load();
  await sw.run('install', {});
  const res = await sw.run('fetch', { request: { method: 'GET', url: 'data/words.json' } });
  assert.equal(String(res), 'net:data/words.json');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(String(sw.store.get('toeic-vocab-v1').get('data/words.json')), 'net:data/words.json');
});

test('fetch falls back to the cache when the network fails', async () => {
  const sw = load({ offline: true });
  await sw.run('install', {});
  assert.equal(await sw.run('fetch', { request: { method: 'GET', url: 'data/words.json' } }), 'cached:data/words.json');
});

test('fetch ignores non-GET requests', async () => {
  const sw = load();
  assert.equal(await sw.run('fetch', { request: { method: 'POST', url: 'data/words.json' } }), undefined);
});

import { readdirSync } from 'node:fs';

test('every src/*.js module is in the offline asset list', () => {
  const m = source.match(/const ASSETS = \[([\s\S]*?)\];/);
  const assets = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  const modules = readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`);
  const missing = modules.filter((f) => !assets.has(f));
  assert.deepEqual(missing, [], `not cached offline: ${missing.join(', ')}`);
});

test('mp3 requests are not intercepted (the app handles audio itself)', async () => {
  const sw = load();
  assert.equal(await sw.run('fetch', { request: { method: 'GET', url: 'https://x.example/app/audio/12.mp3' } }), undefined);
});
