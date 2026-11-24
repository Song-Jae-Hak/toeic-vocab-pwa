import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChoices, meaningLabel } from '../src/choices.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}

const words = [
  { id: 1, en: 'increase', pos: 'v', ko: '증가하다', ko2: '늘리다', group: 'up' },
  { id: 2, en: 'rise', pos: 'v', ko: '오르다', group: 'up' },
  { id: 3, en: 'grow', pos: 'v', ko: '증가하다', group: 'up' },
  { id: 4, en: 'submit', pos: 'v', ko: '제출하다', ko2: '복종하다' },
  { id: 5, en: 'reject', pos: 'v', ko: '거절하다' },
  { id: 6, en: 'confirm', pos: 'v', ko: '확인하다' },
  { id: 7, en: 'achieve', pos: 'v', ko: '달성하다' },
  { id: 8, en: 'urgent', pos: 'adj', ko: '긴급한' },
  { id: 9, en: 'vacant', pos: 'adj', ko: '비어 있는' },
  { id: 10, en: 'promptly', pos: 'adv', ko: '즉시' },
];

test('builds 4 distinct options with the answer at answerIndex', () => {
  const w = words[3];
  const { options, answerIndex } = buildChoices(w, words, lcg(1));
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.equal(options[answerIndex], '제출하다, 복종하다');
  assert.equal(options[answerIndex], meaningLabel(w));
});

test('a two-meaning answer gets two-meaning distractors when there are enough', () => {
  const ws = [
    { id: 1, en: 'attend', pos: 'v', ko: '참석하다', ko2: '처리하다' },
    { id: 2, en: 'a', pos: 'v', ko: '가', ko2: '가2' },
    { id: 3, en: 'b', pos: 'v', ko: '나', ko2: '나2' },
    { id: 4, en: 'c', pos: 'adj', ko: '다', ko2: '다2' },
    { id: 5, en: 'd', pos: 'v', ko: '라' },
    { id: 6, en: 'e', pos: 'v', ko: '마' },
    { id: 7, en: 'f', pos: 'v', ko: '바' },
  ];
  for (let seed = 1; seed <= 30; seed++) {
    const { options } = buildChoices(ws[0], ws, lcg(seed));
    assert.ok(options.every((o) => o.includes(', ')), `seed ${seed}: ${options}`);
  }
});

test('a one-meaning answer gets one-meaning distractors when there are enough', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { options } = buildChoices(words[5], words, lcg(seed));
    assert.ok(options.every((o) => !o.includes(', ')), `seed ${seed}: ${options}`);
  }
});

test('a word whose second meaning equals the answer is never a distractor', () => {
  const ws = [...words, { id: 11, en: 'deny', pos: 'v', ko: '부인하다', ko2: '거절하다' }];
  for (let seed = 1; seed <= 50; seed++) {
    const { options } = buildChoices(ws[4], ws, lcg(seed));
    assert.ok(!options.includes('부인하다, 거절하다'), `seed ${seed}: ${options}`);
  }
});

test('never uses a same-group word as a distractor', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { options } = buildChoices(words[0], words, lcg(seed));
    assert.ok(!options.includes('오르다'), `seed ${seed}: ${options}`);
  }
});

test('never uses a distractor equal to the answer string', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { options, answerIndex } = buildChoices(words[0], words, lcg(seed));
    assert.equal(options.filter((o) => o.startsWith('증가하다')).length, 1);
    assert.equal(options[answerIndex], '증가하다, 늘리다');
  }
});

test('never uses ko2 as a distractor', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { options } = buildChoices(words[4], words, lcg(seed));
    assert.ok(!options.includes('복종하다'));
    assert.ok(!options.includes('늘리다'));
  }
});

test('prefers same part of speech when enough candidates exist', () => {
  const verbKo = new Set(words.filter((x) => x.pos === 'v').map(meaningLabel));
  for (let seed = 1; seed <= 50; seed++) {
    const { options } = buildChoices(words[4], words, lcg(seed));
    assert.ok(options.every((o) => verbKo.has(o)), `seed ${seed}: ${options}`);
  }
});

test('still returns 4 distinct options when few same-pos candidates exist', () => {
  const { options, answerIndex } = buildChoices(words[9], words, lcg(3));
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert.equal(options[answerIndex], '즉시');
});

test('answer position varies with the rng', () => {
  const positions = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    positions.add(buildChoices(words[3], words, lcg(seed)).answerIndex);
  }
  assert.ok(positions.size > 1);
});

test('words sharing any "+"-joined group token are excluded as distractors', () => {
  const ws = [
    { id: 1, en: 'a', pos: 'v', ko: '가', group: 'x+y' },
    { id: 2, en: 'b', pos: 'v', ko: '나', group: 'y' },
    { id: 3, en: 'c', pos: 'v', ko: '다' },
    { id: 4, en: 'd', pos: 'v', ko: '라' },
    { id: 5, en: 'e', pos: 'v', ko: '마' },
  ];
  for (let seed = 1; seed <= 50; seed++) {
    const { options } = buildChoices(ws[0], ws, lcg(seed));
    assert.ok(!options.includes('나'), `seed ${seed}: ${options}`);
  }
});

test('another word whose ko equals the answer word\'s ko2 is never a distractor', () => {
  const ws = [
    { id: 1, en: 'apparently', pos: 'adv', ko: '겉보기에', ko2: '분명히' },
    { id: 2, en: 'clearly', pos: 'adv', ko: '분명히' },
    { id: 3, en: 'rarely', pos: 'adv', ko: '드물게' },
    { id: 4, en: 'nearly', pos: 'adv', ko: '거의' },
    { id: 5, en: 'fully', pos: 'adv', ko: '완전히' },
  ];
  for (let seed = 1; seed <= 50; seed++) {
    const { options } = buildChoices(ws[0], ws, lcg(seed));
    assert.ok(!options.includes('분명히'), `seed ${seed}: ${options}`);
  }
});
