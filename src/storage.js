const KEY = 'toeic-vocab-v1';

export function emptyState() {
  return { version: 1, weights: {}, session: null };
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

function validState(s) {
  return (
    isObject(s) &&
    s.version === 1 &&
    isObject(s.weights) &&
    Object.values(s.weights).every((w) => typeof w === 'number' && Number.isFinite(w)) &&
    validSession(s.session === undefined ? null : s.session)
  );
}

function normalize(s) {
  return { version: 1, weights: s.weights, session: s.session ?? null };
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
