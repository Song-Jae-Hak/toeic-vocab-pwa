export const DEFAULT_WEIGHT = 1;
export const MIN_WEIGHT = 0.3;
export const MAX_WEIGHT = 10;

const WRONG_BONUS = 2;
const CORRECT_FACTOR = 0.8;

export function getWeight(weights, id) {
  const w = weights[id];
  return typeof w === 'number' ? w : DEFAULT_WEIGHT;
}

export function applyAnswer(weights, id, correct) {
  const current = getWeight(weights, id);
  const next = correct
    ? Math.max(MIN_WEIGHT, current * CORRECT_FACTOR)
    : Math.min(MAX_WEIGHT, current + WRONG_BONUS);
  return { ...weights, [id]: Math.round(next * 1000) / 1000 };
}
