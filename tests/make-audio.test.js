import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../tools/make-audio.mjs';

function mockServer(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const call = { headers: req.headers, body: JSON.parse(body) };
        calls.push(call);
        handler(call, calls.length, res);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}/v1/text:synthesize` }));
  });
}

const ok = (res, text) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ audioContent: Buffer.from(`MP3:${text}`).toString('base64') }));
};

const words = [{ id: 1, en: 'invoice' }, { id: 2, en: 'refund' }, { id: 3, en: 'a series of' }];

test('generate writes one mp3 per word, sends the key in a header, and writes the manifest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-'));
  const { server, calls, url } = await mockServer((c, n, res) => ok(res, c.body.input.text));
  try {
    const r = await generate({ words, outDir: dir, endpoint: url, apiKey: 'SECRET', voice: 'v', rate: 0.9, concurrency: 2 });
    assert.deepEqual(r, { generated: 3, skipped: 0, failed: [] });
    assert.equal(readFileSync(join(dir, '2.mp3'), 'utf8'), 'MP3:refund');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), [1, 2, 3]);
    assert.ok(calls.every((c) => c.headers['x-goog-api-key'] === 'SECRET'));
    assert.ok(calls.every((c) => !JSON.stringify(c.body).includes('SECRET')));
  } finally {
    server.close(); rmSync(dir, { recursive: true });
  }
});

test('generate skips words whose mp3 already exists and counts them in the manifest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-'));
  writeFileSync(join(dir, '1.mp3'), 'already here');
  const { server, calls, url } = await mockServer((c, n, res) => ok(res, c.body.input.text));
  try {
    const r = await generate({ words, outDir: dir, endpoint: url, apiKey: 'k', voice: 'v', rate: 1, concurrency: 1 });
    assert.deepEqual(r, { generated: 2, skipped: 1, failed: [] });
    assert.equal(calls.length, 2);
    assert.equal(readFileSync(join(dir, '1.mp3'), 'utf8'), 'already here');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), [1, 2, 3]);
  } finally {
    server.close(); rmSync(dir, { recursive: true });
  }
});

test('generate retries on 429 and then succeeds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-'));
  const { server, calls, url } = await mockServer((c, n, res) => {
    if (n === 1) { res.writeHead(429); res.end('{}'); } else ok(res, c.body.input.text);
  });
  try {
    const r = await generate({ words: [words[0]], outDir: dir, endpoint: url, apiKey: 'k', voice: 'v', rate: 1, concurrency: 1, retryDelayMs: 5 });
    assert.deepEqual(r, { generated: 1, skipped: 0, failed: [] });
    assert.equal(calls.length, 2);
  } finally {
    server.close(); rmSync(dir, { recursive: true });
  }
});

test('generate reports failures, never writes a broken file, and keeps going', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-'));
  const { server, url } = await mockServer((c, n, res) => {
    if (c.body.input.text === 'refund') { res.writeHead(400); res.end(JSON.stringify({ error: { message: 'bad voice' } })); } else ok(res, c.body.input.text);
  });
  try {
    const r = await generate({ words, outDir: dir, endpoint: url, apiKey: 'k', voice: 'v', rate: 1, concurrency: 1, retries: 1, retryDelayMs: 1 });
    assert.equal(r.generated, 2);
    assert.deepEqual(r.failed.map((f) => f.id), [2]);
    assert.equal(existsSync(join(dir, '2.mp3')), false);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), [1, 3]);
  } finally {
    server.close(); rmSync(dir, { recursive: true });
  }
});

test('the api key never appears in the failure report', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-'));
  const { server, url } = await mockServer((c, n, res) => { res.writeHead(403); res.end('{"error":{"message":"denied"}}'); });
  try {
    const r = await generate({ words: [words[0]], outDir: dir, endpoint: url, apiKey: 'TOP-SECRET-KEY', voice: 'v', rate: 1, concurrency: 1, retries: 0 });
    assert.equal(JSON.stringify(r).includes('TOP-SECRET-KEY'), false);
    assert.equal(r.failed.length, 1);
  } finally {
    server.close(); rmSync(dir, { recursive: true });
  }
});
