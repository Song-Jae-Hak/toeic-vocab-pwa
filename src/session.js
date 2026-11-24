import { weightedSample } from './sampler.js';
import { getWeight, applyAnswer } from './weights.js';
import { DEFAULT_DAILY_COUNT, DAILY_COUNT_OPTIONS, isValidDailyCount } from './settings.js';
import { emptyStats, recordStat, isMastered } from './stats.js';
import { studyPools, clampBundle, REVIEW_RATIO } from './bundles.js';

export { DAILY_COUNT_OPTIONS };
export const DAILY_COUNT = DEFAULT_DAILY_COUNT;
export const UNKNOWN_INDEX = 4;

export function todayString(now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Which words may be asked: all of them, or only unlearned ones when hideMastered is on.
function askable(state) {
  if (!state.settings?.hideMastered) return () => true;
  return (id) => !isMastered(state.stats, id);
}

export function ensureTodaySession(state, words, now, rng) {
  const date = todayString(now);
  if (state.session && state.session.date === date) return state;
  const ids = pickIds(state, words, state.settings?.dailyCount ?? DAILY_COUNT, new Set(), rng);
  return { ...state, session: { date, ids, answers: {} } };
}

// Weighted picks of `count` new questions, none in `taken`: words of the current bundle (plus
// unlearned leftovers of earlier ones), with about REVIEW_RATIO of the questions given to learned
// words of earlier bundles. If either pool runs short the other fills in. The two are mixed.
function pickIds(state, words, count, taken, rng) {
  if (count <= 0) return [];
  const ok = askable(state);
  const free = (id) => !taken.has(id) && ok(id);
  const weight = (id) => getWeight(state.weights, id);
  const pools = studyPools(state, words);
  const main = pools.main.filter(free);
  const review = pools.review.filter(free);
  const reviewWanted = Math.min(review.length, Math.round(count * REVIEW_RATIO));
  const fromMain = weightedSample(main, weight, count - reviewWanted, rng);
  const fromReview = weightedSample(review, weight, count - fromMain.length, rng);
  const ids = [...fromMain, ...fromReview];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function currentIndex(session) {
  const i = session.ids.findIndex((id) => !(id in session.answers));
  return i === -1 ? session.ids.length : i;
}

export function recordAnswer(state, wordId, chosen, correct) {
  const session = state.session;
  if (!session || !session.ids.includes(wordId) || wordId in session.answers) return state;
  const isCorrect = chosen === UNKNOWN_INDEX ? false : correct;
  return {
    ...state,
    weights: applyAnswer(state.weights, wordId, isCorrect),
    stats: recordStat(state.stats ?? emptyStats(), wordId, isCorrect, session.date),
    session: {
      ...session,
      answers: { ...session.answers, [wordId]: { chosen, correct: isCorrect } },
    },
  };
}

export function progress(session) {
  const answers = Object.values(session.answers);
  const correct = answers.filter((a) => a.correct).length;
  return {
    done: answers.length,
    total: session.ids.length,
    correct,
    wrong: answers.length - correct,
  };
}

const LONG_ABSENCE_MS = 60 * 60 * 1000;

// Decide whether to open a new daily session when the app comes back to the foreground.
// A sitting that is still active is never interrupted at midnight.
export function shouldStartNewSession(state, now, { finished, hiddenMs }) {
  if (!state.session) return true;
  if (state.session.date === todayString(now)) return false;
  return finished || hiddenMs >= LONG_ABSENCE_MS;
}

// Rebuild today's unanswered questions to match the settings: answered words are always kept,
// unanswered ones that may no longer be asked are dropped, then the rest is trimmed or topped up
// with new weighted picks.
function refitSession(state, words, rng, { dropUnanswered = false } = {}) {
  const session = state.session;
  if (!session) return state;
  const count = state.settings?.dailyCount ?? DAILY_COUNT;
  const ok = dropUnanswered ? () => false : askable(state);

  const isAnswered = (id) => id in session.answers;
  const answeredCount = session.ids.filter(isAnswered).length;
  const need = count - answeredCount;
  const unanswered = session.ids.filter((id) => !isAnswered(id) && ok(id));
  const keep = new Set(unanswered.slice(0, Math.max(need, 0)));
  let ids = session.ids.filter((id) => isAnswered(id) || keep.has(id));

  const extra = need - keep.size;
  if (extra > 0) ids = [...ids, ...pickIds(state, words, extra, new Set(ids), rng)];
  return { ...state, session: { ...session, ids } };
}

// Change how many questions a day has. Applies to today's session right away.
export function setDailyCount(state, words, count, rng) {
  if (!isValidDailyCount(count)) return state;
  return refitSession({ ...state, settings: { ...state.settings, dailyCount: count } }, words, rng);
}

// Turn hiding of learned words (answered right MASTERED_STREAK times in a row) on or off. Turning it on
// swaps learned words out of today's unanswered questions right away.
export function setHideMastered(state, words, on, rng) {
  if (typeof on !== 'boolean') return state;
  return refitSession({ ...state, settings: { ...state.settings, hideMastered: on } }, words, rng);
}

// Switch to studying bundle b. Today's answered questions stay; the unanswered ones are re-picked
// from the new bundle right away.
export function setBundle(state, words, b, rng) {
  if (!Number.isInteger(b) || clampBundle(words, b) !== b) return state;
  return refitSession({ ...state, settings: { ...state.settings, bundle: b } }, words, rng, { dropUnanswered: true });
}

// After the word list changes: remove not-yet-answered words that no longer exist from today's session.
// Answered ones stay so today's progress and history remain consistent.
export function pruneSession(state, words) {
  const session = state.session;
  if (!session) return state;
  const valid = new Set(words.map((w) => w.id));
  const ids = session.ids.filter((id) => valid.has(id) || id in session.answers);
  if (ids.length === session.ids.length) return state;
  return { ...state, session: { ...session, ids } };
}
