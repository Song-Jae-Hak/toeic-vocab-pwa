export const DEFAULT_DAILY_COUNT = 300;
export const DAILY_COUNT_OPTIONS = [100, 200, 300, 400, 500];
export const FONT_SIZES = ['small', 'normal', 'large', 'xlarge'];
export const THEMES = ['system', 'light', 'dark'];

export const DEFAULT_SETTINGS = Object.freeze({
  dailyCount: DEFAULT_DAILY_COUNT,
  autoNext: false,
  autoPlay: false,
  fontSize: 'normal',
  theme: 'system',
});

export function isValidDailyCount(n) {
  return DAILY_COUNT_OPTIONS.includes(n);
}

const CHECKS = {
  dailyCount: isValidDailyCount,
  autoNext: (v) => typeof v === 'boolean',
  autoPlay: (v) => typeof v === 'boolean',
  fontSize: (v) => FONT_SIZES.includes(v),
  theme: (v) => THEMES.includes(v),
};

// A settings object is valid if it is an object whose present fields all have allowed values.
export function isValidSettings(s) {
  if (s === undefined) return true;
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return false;
  return Object.keys(CHECKS).every((k) => s[k] === undefined || CHECKS[k](s[k]));
}

export function normalizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (s) for (const k of Object.keys(CHECKS)) if (s[k] !== undefined && CHECKS[k](s[k])) out[k] = s[k];
  return out;
}

// Returns a new state with one setting changed; invalid keys or values leave the settings as they were.
export function withSetting(state, key, value) {
  if (!(key in CHECKS) || !CHECKS[key](value)) return { ...state, settings: normalizeSettings(state.settings) };
  return { ...state, settings: normalizeSettings({ ...state.settings, [key]: value }) };
}
