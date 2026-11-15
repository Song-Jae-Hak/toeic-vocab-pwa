import { weightedSample } from './sampler.js';
import { getWeight, applyAnswer } from './weights.js';
import { DEFAULT_DAILY_COUNT, DAILY_COUNT_OPTIONS, isValidDailyCount } from './settings.js';

export { DAILY_COUNT_OPTIONS };
export const DAILY_COUNT = DEFAULT_DAILY_COUNT;
export const UNKNOWN_INDEX = 4;

export function todayString(now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ensureTodaySession(state, words, now, rng) {
  const date = todayString(now);
  if (state.session && state.session.date === date) return state;
  const ids = weightedSample(
    words.map((w) => w.id),
    (id) => getWeight(state.weights, id),
    state.settings?.dailyCount ?? DAILY_COUNT,
    rng,
  );
  return { ...state, session: { date, ids, answers: {} } };
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

// Change how many questions a day has. Applies to today's session right away: answered words are
// always kept, unanswered ones are trimmed or topped up with new weighted picks.
export function setDailyCount(state, words, count, rng) {
  if (!isValidDailyCount(count)) return state;
  const settings = { ...state.settings, dailyCount: count };
  const session = state.session;
  if (!session) return { ...state, settings };

  const isAnswered = (id) => id in session.answers;
  const answeredCount = session.ids.filter(isAnswered).length;
  const need = count - answeredCount;
  const unanswered = session.ids.filter((id) => !isAnswered(id));
  const keep = new Set(unanswered.slice(0, Math.max(need, 0)));
  let ids = session.ids.filter((id) => isAnswered(id) || keep.has(id));

  const extra = need - keep.size;
  if (extra > 0) {
    const taken = new Set(ids);
    const pool = words.map((w) => w.id).filter((id) => !taken.has(id));
    ids = [...ids, ...weightedSample(pool, (id) => getWeight(state.weights, id), extra, rng)];
  }
  return { ...state, settings, session: { ...session, ids } };
}
