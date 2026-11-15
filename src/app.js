import { loadState, saveState, exportState, importState } from './storage.js';
import {
  ensureTodaySession, currentIndex, recordAnswer, progress, shouldStartNewSession, UNKNOWN_INDEX,
} from './session.js';
import { buildChoices } from './choices.js';

const $ = (id) => document.getElementById(id);
const POS_LABEL = { n: '명사', v: '동사', adj: '형용사', adv: '부사', prep: '전치사', conj: '접속사', phr: '구문' };

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
  for (const id of ['quiz', 'done', 'error']) $(id).hidden = id !== section;
}

function renderProgress() {
  const p = progress(state.session);
  $('progress').textContent = `오늘 ${p.done} / ${p.total}  ·  ✔ ${p.correct}  ✘ ${p.wrong}`;
}

function renderDone() {
  const p = progress(state.session);
  $('done-summary').textContent = `${p.total}문제 중 ${p.correct}개 정답, ${p.wrong}개 오답`;
  const list = $('done-wrong');
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

function renderQuestion() {
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
  state = ensureTodaySession(loadState(safeStore()), words, new Date(), Math.random);
  persist();
  renderQuestion();
}

start();
