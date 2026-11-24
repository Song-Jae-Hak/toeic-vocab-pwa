function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// What an option shows: the main meaning, plus the second one when the word has it.
export function meaningLabel(w) {
  return w.ko2 ? `${w.ko}, ${w.ko2}` : w.ko;
}

// Distractor labels, skipping any whose main meaning was already used.
function uniqueLabels(candidates, seen) {
  const out = [];
  for (const c of candidates) {
    if (!seen.has(c.ko)) {
      seen.add(c.ko);
      out.push(meaningLabel(c));
    }
  }
  return out;
}

// True if the two words share any meaning, so one cannot be a wrong option for the other.
function shareMeaning(a, b) {
  const mine = new Set([a.ko, a.ko2].filter(Boolean));
  return mine.has(b.ko) || (b.ko2 !== undefined && mine.has(b.ko2));
}

function groupTokens(w) {
  return w.group ? w.group.split('+') : [];
}

function shareGroup(a, b) {
  const tokens = new Set(groupTokens(a));
  return groupTokens(b).some((t) => tokens.has(t));
}

export function buildChoices(word, allWords, rng) {
  const eligible = allWords.filter(
    (w) => w.id !== word.id && !shareMeaning(word, w) && !shareGroup(word, w),
  );
  // Prefer distractors shaped like the answer (one meaning or two) so the comma gives nothing away,
  // then the same part of speech.
  const sameShape = (w) => Boolean(w.ko2) === Boolean(word.ko2);
  const pick = (pos, shape) => shuffle(eligible.filter((w) => (w.pos === word.pos) === pos && sameShape(w) === shape), rng);

  const seen = new Set([word.ko]);
  const distractors = [
    ...uniqueLabels(pick(true, true), seen),
    ...uniqueLabels(pick(false, true), seen),
    ...uniqueLabels(pick(true, false), seen),
    ...uniqueLabels(pick(false, false), seen),
  ].slice(0, 3);

  const answer = meaningLabel(word);
  const options = shuffle([answer, ...distractors], rng);
  return { options, answerIndex: options.indexOf(answer) };
}
