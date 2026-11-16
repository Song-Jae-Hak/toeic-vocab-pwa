import { loadState, saveState, exportState, importState } from './storage.js';
import {
  ensureTodaySession, currentIndex, recordAnswer, progress, shouldStartNewSession, setDailyCount, pruneSession, DAILY_COUNT_OPTIONS, UNKNOWN_INDEX,
} from './session.js';
import { buildChoices } from './choices.js';
import { withSetting } from './settings.js';
import { summary, topWrong } from './stats.js';
import { AUDIO_CACHE, loadAudioBlob, parseManifest } from './audio.js';
import { todayString } from './session.js';

const $ = (id) => document.getElementById(id);
const POS_LABEL = { n: '명사', v: '동사', adj: '형용사', adv: '부사', prep: '전치사', conj: '접속사', phr: '구문' };

let audioIds = new Set();
let audioCache = null;
let currentAudio = null;
let currentAudioUrl = null;
let currentWordId = null;

async function loadAudioManifest() {
  try {
    audioCache = 'caches' in window ? await caches.open(AUDIO_CACHE) : null;
  } catch {
    audioCache = null;
  }
  try {
    const res = await fetch('audio/manifest.json', { cache: 'no-cache' });
    if (res.ok) audioIds = parseManifest(await res.json());
  } catch {
    /* no audio available (offline first run or not generated yet) */
  }
}

async function playWord(id) {
  const blob = await loadAudioBlob(id, { cache: audioCache });
  if (!blob) return;
  if (currentAudio) currentAudio.pause();
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentAudioUrl);
  try {
    await currentAudio.play();
  } catch {
    /* the browser blocked auto-play until the first tap: the 🔊 button still works */
  }
}

let words = [];
let byId = new Map();
let state;

function safeStore() {
  try {
    return window.localStorage;
  } catch {
    return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  }
}

function persist() {
  $('banner').hidden = saveState(safeStore(), state);
}

// Small deterministic rng so a question shows the same options after a reload.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateSeed(date) {
  return Number(date.replace(/-/g, '')) || 0;
}

function show(section) {
  for (const id of ['quiz', 'done', 'error', 'stats']) $(id).hidden = id !== section;
}

function renderProgress() {
  const p = progress(state.session);
  $('progress').textContent = `오늘 ${p.done} / ${p.total}  ·  ✔ ${p.correct}  ✘ ${p.wrong}`;
}

function renderDone() {
  const p = progress(state.session);
  $('done-summary').textContent = `${p.total}문제 중 ${p.correct}개 정답, ${p.wrong}개 오답`;
  const list = $('done-wrong');
  $('done-hint').textContent = `내일 새 ${state.settings.dailyCount}문제가 열립니다.`;
  list.textContent = '';
  const wrongIds = state.session.ids.filter((id) => state.session.answers[id] && !state.session.answers[id].correct);
  if (wrongIds.length === 0) {
    const li = document.createElement('li');
    li.textContent = '틀린 단어가 없어요!';
    list.append(li);
  }
  for (const id of wrongIds.slice(0, 30)) {
    const w = byId.get(id);
    if (!w) continue;
    const li = document.createElement('li');
    li.textContent = `${w.en} — ${w.ko}`;
    list.append(li);
  }
  show('done');
}

let questionToken = 0;

function renderQuestion() {
  questionToken++;
  const token = questionToken;
  const session = state.session;
  const idx = currentIndex(session);
  renderProgress();
  if (idx >= session.ids.length) {
    renderDone();
    return;
  }
  const word = byId.get(session.ids[idx]);
  if (!word) {
    // Word no longer exists in the data file: skip it without touching its weight.
    state = recordAnswer(state, session.ids[idx], UNKNOWN_INDEX, false);
    persist();
    renderQuestion();
    return;
  }

  const { options, answerIndex } = buildChoices(
    word,
    words,
    seeded(word.id * 7919 + dateSeed(session.date)),
  );

  $('pos').textContent = POS_LABEL[word.pos] ?? word.pos;
  $('word').textContent = word.en;
  $('feedback').hidden = true;
  $('feedback-text').textContent = '';
  $('feedback-extra').textContent = '';
  currentWordId = word.id;
  $('speak-btn').hidden = !audioIds.has(word.id);
  if (state.settings.autoPlay && audioIds.has(word.id)) playWord(word.id);

  const box = $('options');
  box.textContent = '';
  const buttons = [];
  options.forEach((text, i) => buttons.push(makeOption(`${i + 1}`, text, i, false)));
  buttons.push(makeOption('5', '모르겠다', UNKNOWN_INDEX, true));
  buttons.forEach((b) => box.append(b));

  // Ignore taps right after rendering so a fast double tap on "다음" cannot answer the next question.
  let answered = true;
  setTimeout(() => { answered = false; }, 300);
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const chosen = Number(btn.dataset.index);
      const correct = chosen === answerIndex;
      state = recordAnswer(state, word.id, chosen, correct);
      persist();
      buttons.forEach((b) => { b.disabled = true; });
      buttons[answerIndex].classList.add('correct');
      if (!correct) btn.classList.add('wrong');
      showFeedback(word, correct, chosen === UNKNOWN_INDEX);
      renderProgress();
      // Keep option 5 above the bottom "다음" bar: scrolls only when it would be covered.
      buttons[buttons.length - 1].scrollIntoView({ block: 'nearest' });
      if (correct && state.settings.autoNext) {
        setTimeout(() => { if (token === questionToken) renderQuestion(); }, 700);
      }
    });
  });
  show('quiz');
  window.scrollTo(0, 0);
}

function makeOption(label, text, index, unknown) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = unknown ? 'opt unknown' : 'opt';
  b.dataset.index = String(index);
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = label;
  b.append(num, document.createTextNode(text));
  return b;
}

function showFeedback(word, correct, unknown) {
  $('feedback-text').textContent = correct ? '정답!' : unknown ? `정답: ${word.ko}` : `오답 — 정답: ${word.ko}`;
  $('feedback-extra').textContent = word.ko2 ? `다른 뜻: ${word.ko2}` : '';
  $('feedback').hidden = false;
}

function setMenuMessage(text) {
  $('menu-msg').textContent = text;
}

function segmented(boxId, options, current, onPick) {
  const box = $(boxId);
  box.textContent = '';
  for (const { value, label } of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(current === value));
    b.addEventListener('click', () => {
      if (current !== value) onPick(value);
    });
    box.append(b);
  }
}

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.fontSize = state.settings.fontSize;
}

function renderSettings() {
  const s = state.settings;
  segmented('daily-options', DAILY_COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) })), s.dailyCount, (n) => {
    state = setDailyCount(state, words, n, Math.random);
    persist();
    renderSettings();
    renderQuestion();
    $('settings-msg').textContent = `하루 ${n}문제로 바꿨습니다. 오늘 푼 문제는 그대로 유지됩니다.`;
  });
  const change = (key) => (value) => {
    state = withSetting(state, key, value);
    persist();
    applyAppearance();
    renderSettings();
    $('settings-msg').textContent = '';
  };
  segmented('auto-options', [{ value: false, label: '끄기' }, { value: true, label: '켜기' }], s.autoNext, change('autoNext'));
  segmented('play-options', [{ value: false, label: '끄기' }, { value: true, label: '켜기' }], s.autoPlay, change('autoPlay'));
  segmented('font-options', [{ value: 'small', label: '작게' }, { value: 'normal', label: '보통' }, { value: 'large', label: '크게' }, { value: 'xlarge', label: '아주 크게' }], s.fontSize, change('fontSize'));
  segmented('theme-options', [{ value: 'system', label: '기기 설정' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }], s.theme, change('theme'));
}

function renderStats() {
  const sm = summary(state.stats, todayString(new Date()));
  const grid = $('stats-summary');
  grid.textContent = '';
  for (const [label, value] of [
    ['푼 문제', `${sm.totalAnswered}개`],
    ['정답률', `${sm.accuracy}%`],
    ['연속 학습일', `${sm.streak}일`],
    ['학습한 날', `${sm.daysStudied}일`],
  ]) {
    const box = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    box.append(dt, dd);
    grid.append(box);
  }
  const list = $('stats-wrong');
  list.textContent = '';
  const wrong = topWrong(state.stats, 30).filter((w) => byId.has(w.id));
  if (wrong.length === 0) {
    const li = document.createElement('li');
    li.textContent = '아직 틀린 단어가 없어요.';
    list.append(li);
  }
  for (const w of wrong) {
    const word = byId.get(w.id);
    const li = document.createElement('li');
    li.textContent = `${word.en} — ${word.ko}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `틀림 ${w.wrong} · 맞음 ${w.right}`;
    li.append(meta);
    list.append(li);
  }
  show('stats');
  window.scrollTo(0, 0);
}

function wireSettings() {
  $('settings-btn').addEventListener('click', () => {
    const open = $('settings').hidden;
    $('settings').hidden = !open;
    $('settings-btn').setAttribute('aria-expanded', String(open));
    $('settings-msg').textContent = '';
  });
  $('stats-btn').addEventListener('click', () => {
    $('settings').hidden = true;
    $('settings-btn').setAttribute('aria-expanded', 'false');
    renderStats();
  });
  $('stats-back').addEventListener('click', renderQuestion);
  $('speak-btn').addEventListener('click', () => {
    if (currentWordId !== null) playWord(currentWordId);
  });
}

function wireMenu() {
  $('export-btn').addEventListener('click', () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `toeic-vocab-${state.session ? state.session.date : 'backup'}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMenuMessage('내보내기를 시작했습니다. 파일이 저장됐는지 확인하세요.');
  });
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const result = importState(await file.text());
    if (!result.ok) {
      setMenuMessage(result.error);
      return;
    }
    if (!window.confirm('현재 기록이 대체됩니다. 계속할까요?')) return;
    state = ensureTodaySession(result.state, words, new Date(), Math.random);
    persist();
    setMenuMessage('기록을 가져왔습니다.');
    renderQuestion();
  });
  $('next-btn').addEventListener('click', renderQuestion);
}

let hiddenAt = null;

function wireResume() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (!state) return;
    const hiddenMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    const finished = !$('done').hidden;
    if (shouldStartNewSession(state, new Date(), { finished, hiddenMs })) {
      state = ensureTodaySession(state, words, new Date(), Math.random);
      persist();
      renderQuestion();
    }
  });
}

async function start() {
  wireMenu();
  wireSettings();
  wireResume();
  try {
    const res = await fetch('data/words.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    words = await res.json();
  } catch {
    $('error-text').textContent = '단어 데이터를 불러오지 못했습니다. 새로고침해 주세요.';
    $('progress').textContent = '';
    show('error');
    return;
  }
  byId = new Map(words.map((w) => [w.id, w]));
  await loadAudioManifest();
  state = pruneSession(ensureTodaySession(loadState(safeStore()), words, new Date(), Math.random), words);
  persist();
  applyAppearance();
  renderSettings();
  renderQuestion();
}

start();
