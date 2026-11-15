import test from 'node:test';
import assert from 'node:assert/strict';
import { withSetting, DEFAULT_SETTINGS } from '../src/settings.js';

const base = { version: 1, settings: { ...DEFAULT_SETTINGS }, weights: {}, session: null };

test('withSetting applies a valid change and keeps the other settings', () => {
  const out = withSetting(base, 'theme', 'dark');
  assert.equal(out.settings.theme, 'dark');
  assert.equal(out.settings.dailyCount, 300);
  assert.equal(base.settings.theme, 'system');
});

test('withSetting ignores unknown keys and invalid values', () => {
  assert.deepEqual(withSetting(base, 'theme', 'blue').settings, base.settings);
  assert.deepEqual(withSetting(base, 'fontSize', 'huge').settings, base.settings);
  assert.deepEqual(withSetting(base, 'autoNext', 'yes').settings, base.settings);
  assert.deepEqual(withSetting(base, 'bogus', 1).settings, base.settings);
});

test('withSetting accepts autoNext booleans and font sizes', () => {
  assert.equal(withSetting(base, 'autoNext', true).settings.autoNext, true);
  assert.equal(withSetting(base, 'fontSize', 'xlarge').settings.fontSize, 'xlarge');
});

test('autoPlay is a boolean setting that defaults to off', () => {
  assert.equal(DEFAULT_SETTINGS.autoPlay, false);
  assert.equal(withSetting(base, 'autoPlay', true).settings.autoPlay, true);
  assert.equal(withSetting(base, 'autoPlay', 'yes').settings.autoPlay, false);
});

import { FONT_SIZES } from '../src/settings.js';

test('font sizes run from small to xlarge, with normal still the default', () => {
  assert.deepEqual(FONT_SIZES, ['small', 'normal', 'large', 'xlarge']);
  assert.equal(DEFAULT_SETTINGS.fontSize, 'normal');
  assert.equal(withSetting(base, 'fontSize', 'small').settings.fontSize, 'small');
});
