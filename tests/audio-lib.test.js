import test from 'node:test';
import assert from 'node:assert/strict';
import { speakable, buildRequest, pendingWords, totalChars } from '../tools/audio-lib.mjs';

test('speakable tidies text for the voice engine', () => {
  assert.equal(speakable('  be late   for an appointment '), 'be late for an appointment');
  assert.equal(speakable('according to'), 'according to');
  assert.equal(speakable('a~b'), 'a b');
  assert.equal(speakable('e-book'), 'e-book');
  assert.equal(speakable("o'clock"), "o'clock");
});

test('buildRequest creates a Google Text-to-Speech MP3 request body', () => {
  const body = buildRequest('invoice', { voice: 'en-US-Neural2-F', rate: 0.9 });
  assert.deepEqual(body, {
    input: { text: 'invoice' },
    voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
  });
});

const words = [
  { id: 1, en: 'invoice' },
  { id: 2, en: 'refund' },
  { id: 5, en: 'a series of' },
  { id: 9, en: 'memo' },
];

test('pendingWords skips ids that already have audio and honours the limit', () => {
  assert.deepEqual(pendingWords(words, new Set([2, 9])).map((w) => w.id), [1, 5]);
  assert.deepEqual(pendingWords(words, new Set(), 2).map((w) => w.id), [1, 2]);
  assert.deepEqual(pendingWords(words, new Set([1, 2, 5, 9])), []);
});

test('totalChars counts the characters that would be sent', () => {
  assert.equal(totalChars(words), 'invoice'.length + 'refund'.length + 'a series of'.length + 'memo'.length);
});
