import { DEFAULT_SETTINGS, isValidSettings, normalizeSettings } from './settings.js';
import { emptyStats } from './stats.js';

const KEY = 'toeic-vocab-v1';

export function emptyState() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, stats: emptyStats(), weights: {}, session: null };
}

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validSession(s) {
  if (s === null) return true;
  if (!isObject(s)) return false;
  if (typeof s.date !== 'string') return false;
  if (!Array.isArray(s.ids) || !s.ids.every(Number.isInteger)) return false;
  if (!isObject(s.answers)) return false;
  return Object.values(s.answers).every(
    (a) => isObject(a) && Number.isInteger(a.chosen) && typeof a.correct === 'boolean',
  );
}

function validStats(s) {
  if (s === undefined) return true;
  if (!isObject(s) || !isObject(s.words) || !isObject(s.days)) return false;
  const count = (n) => Number.isInteger(n) && n >= 0;
  return (
    Object.values(s.words).every((w) => isObject(w) && count(w.right) && count(w.wrong)) &&
    Object.values(s.days).every((d) => isObject(d) && count(d.n) && count(d.right))
  );
}

function validState(s) {
  return (
    isObject(s) &&
    s.version === 1 &&
    isValidSettings(s.settings) &&
    validStats(s.stats) &&
    isObject(s.weights) &&
    Object.values(s.weights).every((w) => typeof w === 'number' && Number.isFinite(w)) &&
    validSession(s.session === undefined ? null : s.session)
  );
}

function normalize(s) {
  return {
    version: 1,
    settings: normalizeSettings(s.settings),
    stats: s.stats ?? emptyStats(),
    weights: s.weights,
    session: s.session ?? null,
  };
}

export function loadState(store) {
  try {
    const raw = store.getItem(KEY);
    if (raw === null || raw === undefined) return emptyState();
    const parsed = JSON.parse(raw);
    return validState(parsed) ? normalize(parsed) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(store, state) {
  try {
    store.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state) {
  return JSON.stringify(state);
}

export function importState(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '올바른 기록 파일이 아닙니다.' };
  }
  if (!validState(parsed)) {
    return { ok: false, error: '이 앱에서 내보낸 기록 파일이 아닙니다.' };
  }
  return { ok: true, state: normalize(parsed) };
}
