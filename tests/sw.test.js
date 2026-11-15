import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('sw.js', root), 'utf8');

function load() {
  const listeners = {};
  const store = new Map(); // cacheName -> Map(url -> response)
  const added = [];
  const caches = {
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      return {
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
  const sandbox = { self, caches, fetch: async (req) => { fetchCalls.push(req.url); return `net:${req.url}`; }, URL };
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

test('activate removes caches with other names but keeps the current one', async () => {
  const sw = load();
  await sw.run('install', {});
  sw.store.set('old-cache', new Map());
  await sw.run('activate', {});
  assert.deepEqual([...sw.store.keys()], ['toeic-vocab-v1']);
});

test('fetch serves from cache first, falls back to the network, ignores non-GET', async () => {
  const sw = load();
  await sw.run('install', {});
  assert.equal(await sw.run('fetch', { request: { method: 'GET', url: 'data/words.json' } }), 'cached:data/words.json');
  assert.equal(await sw.run('fetch', { request: { method: 'GET', url: 'unknown.txt' } }), 'net:unknown.txt');
  // A POST must not be intercepted: respondWith is never called, so nothing is returned.
  assert.equal(await sw.run('fetch', { request: { method: 'POST', url: 'data/words.json' } }), undefined);
});
