import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, PAGE_SIZE } from '../src/paginate.js';

const nums = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('the default page size is 25', () => {
  assert.equal(PAGE_SIZE, 25);
});

test('first page holds 25 items and reports the page count', () => {
  const p = paginate(nums(60), 1);
  assert.equal(p.items.length, 25);
  assert.equal(p.items[0], 1);
  assert.equal(p.items[24], 25);
  assert.equal(p.pageCount, 3);
  assert.equal(p.page, 1);
  assert.equal(p.total, 60);
  assert.equal(p.start, 1);
});

test('the last page holds the remainder', () => {
  const p = paginate(nums(60), 3);
  assert.deepEqual(p.items, nums(60).slice(50));
  assert.equal(p.items.length, 10);
  assert.equal(p.start, 51);
});

test('exactly one full page does not create an empty second page', () => {
  assert.equal(paginate(nums(25), 1).pageCount, 1);
  assert.equal(paginate(nums(26), 1).pageCount, 2);
  assert.equal(paginate(nums(50), 2).items.length, 25);
});

test('every item appears on exactly one page', () => {
  const all = [];
  const first = paginate(nums(103), 1);
  for (let p = 1; p <= first.pageCount; p++) all.push(...paginate(nums(103), p).items);
  assert.deepEqual(all, nums(103));
});

test('an out-of-range or invalid page is clamped to a valid one', () => {
  assert.equal(paginate(nums(60), 0).page, 1);
  assert.equal(paginate(nums(60), -5).page, 1);
  assert.equal(paginate(nums(60), 99).page, 3);
  assert.equal(paginate(nums(60), 'x').page, 1);
  assert.equal(paginate(nums(60), 2.7).page, 2);
});

test('an empty list gives one empty page', () => {
  const p = paginate([], 1);
  assert.deepEqual(p.items, []);
  assert.equal(p.pageCount, 1);
  assert.equal(p.page, 1);
  assert.equal(p.total, 0);
});

test('a custom page size is honoured', () => {
  const p = paginate(nums(10), 2, 4);
  assert.deepEqual(p.items, [5, 6, 7, 8]);
  assert.equal(p.pageCount, 3);
});

test('the input array is not modified', () => {
  const a = Object.freeze(nums(30));
  assert.doesNotThrow(() => paginate(a, 2));
});
