import { weightedSample } from './sampler.js';
import { getWeight, applyAnswer } from './weights.js';

export const DAILY_COUNT = 300;
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
    DAILY_COUNT,
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
