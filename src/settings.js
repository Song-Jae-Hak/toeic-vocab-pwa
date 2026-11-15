export const DEFAULT_DAILY_COUNT = 300;
export const DAILY_COUNT_OPTIONS = [100, 200, 300, 400, 500];

export function isValidDailyCount(n) {
  return DAILY_COUNT_OPTIONS.includes(n);
}
