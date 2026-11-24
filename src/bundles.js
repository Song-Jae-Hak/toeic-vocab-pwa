import { isMastered } from './stats.js';

// The word list is split, in id order, into bundles of this many words. Only one bundle is studied at a time.
export const BUNDLE_SIZE = 900;
// Share of a bundle that must be learned before the app offers the next bundle.
export const UNLOCK_RATIO = 0.8;
// Share of each day's questions given to learned words of earlier bundles, so they are not forgotten.
export const REVIEW_RATIO = 0.1;

function sortedIds(words) {
  return words.map((w) => w.id).sort((a, b) => a - b);
}

export function bundleCount(words) {
  return Math.max(1, Math.ceil(words.length / BUNDLE_SIZE));
}

export function clampBundle(words, b) {
  const n = Number.isInteger(b) ? b : 0;
  return Math.min(Math.max(0, n), bundleCount(words) - 1);
}

export function currentBundle(state, words) {
  return clampBundle(words, state.settings?.bundle ?? 0);
}

// Map from word id to its bundle number (0-based).
export function bundleOf(words) {
  const map = new Map();
  sortedIds(words).forEach((id, i) => map.set(id, Math.floor(i / BUNDLE_SIZE)));
  return map;
}

export function bundleIds(words, b) {
  return sortedIds(words).slice(b * BUNDLE_SIZE, (b + 1) * BUNDLE_SIZE);
}

// How much of bundle b is learned, and whether the next bundle may be offered.
export function bundleProgress(state, words, b) {
  const ids = bundleIds(words, b);
  const mastered = ids.filter((id) => isMastered(state.stats, id)).length;
  const total = ids.length;
  const ratio = total ? mastered / total : 0;
  return { mastered, total, ratio, canAdvance: ratio >= UNLOCK_RATIO && b + 1 < bundleCount(words) };
}

// The words the current bundle studies (`main`): its own words plus words already seen in earlier
// bundles but not learned yet. `review`: learned words of earlier bundles.
export function studyPools(state, words) {
  const cur = currentBundle(state, words);
  const of = bundleOf(words);
  const main = [];
  const review = [];
  for (const id of sortedIds(words)) {
    const b = of.get(id);
    if (b === cur) main.push(id);
    else if (b < cur) {
      if (isMastered(state.stats, id)) review.push(id);
      else if (state.stats?.words?.[id]) main.push(id);
    }
  }
  return { main, review };
}
