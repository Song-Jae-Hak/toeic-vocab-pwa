import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeight, applyAnswer } from '../src/weights.js';

test('unknown id gets the default weight 1', () => {
  assert.equal(getWeight({}, 7), 1);
});

test('wrong answer adds 2', () => {
  assert.equal(applyAnswer({}, 1, false)[1], 3);
});

test('wrong answer is capped at 10', () => {
  assert.equal(applyAnswer({ 1: 9 }, 1, false)[1], 10);
});

test('correct answer multiplies by 0.8', () => {
  assert.equal(applyAnswer({}, 1, true)[1], 0.8);
});

test('correct answer never goes below 0.3', () => {
  assert.equal(applyAnswer({ 1: 0.3 }, 1, true)[1], 0.3);
});

test('applyAnswer does not mutate its input', () => {
  const input = Object.freeze({ 1: 2 });
  const out = applyAnswer(input, 1, false);
  assert.equal(input[1], 2);
  assert.equal(out[1], 4);
});
