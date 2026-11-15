import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWords } from '../tools/validate-words.mjs';

const good = () => [
  { id: 1, en: 'increase', pos: 'v', ko: '증가하다', group: 'up' },
  { id: 2, en: 'rise', pos: 'v', ko: '오르다', group: 'up' },
  { id: 3, en: 'invoice', pos: 'n', ko: '송장' },
];

test('a valid list has no problems', () => {
  assert.deepEqual(validateWords(good()), []);
});

test('duplicate en (case-insensitive) is reported', () => {
  const w = good();
  w[2].en = 'Increase';
  assert.ok(validateWords(w).some((p) => /duplicate/i.test(p)));
});

test('missing required field is reported', () => {
  const w = good();
  delete w[2].ko;
  assert.ok(validateWords(w).some((p) => /missing/i.test(p)));
});

test('unknown pos is reported', () => {
  const w = good();
  w[2].pos = 'noun';
  assert.ok(validateWords(w).some((p) => /pos/i.test(p)));
});

test('a duplicate id is reported', () => {
  const w = good();
  w[2].id = 1;
  assert.ok(validateWords(w).some((p) => /id/i.test(p)));
});

test('empty ko is reported', () => {
  const w = good();
  w[2].ko = '  ';
  assert.ok(validateWords(w).some((p) => /ko/i.test(p)));
});

test('ko made only of latin letters is reported', () => {
  const w = good();
  w[2].ko = 'invoice';
  assert.ok(validateWords(w).some((p) => /ko/i.test(p)));
});

test('a group with a single word is reported', () => {
  const w = good();
  w[2].group = 'lonely';
  assert.ok(validateWords(w).some((p) => /group/i.test(p)));
});

test('idCheck:false skips the id and single-word-group checks (per-batch mode)', () => {
  const w = good().map((x) => ({ ...x, id: 0 }));
  assert.deepEqual(validateWords(w, { idCheck: false }), []);
});

test('a "+"-joined group token used by only one word is reported', () => {
  const w = good();
  w[0].group = 'up+solo';
  assert.ok(validateWords(w).some((p) => /solo/.test(p)));
});

test('words sharing a "+"-joined group token count as a pair', () => {
  const w = good();
  w[0].group = 'up+pair';
  w[2].group = 'pair';
  w[1].group = 'up';
  assert.deepEqual(validateWords(w), []);
});

test('ids may have gaps but must be unique positive integers', () => {
  const w = good();
  w[2].id = 9;
  assert.deepEqual(validateWords(w), []);
  w[1].id = 9;
  assert.ok(validateWords(w).some((p) => /id/i.test(p)));
  w[1].id = 0;
  assert.ok(validateWords(w).some((p) => /id/i.test(p)));
});

test('"phr" (phrase/collocation) is an accepted part of speech', () => {
  const w = good();
  w[2].pos = 'phr';
  assert.deepEqual(validateWords(w), []);
});
