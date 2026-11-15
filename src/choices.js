function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueKo(candidates, seen) {
  const out = [];
  for (const c of candidates) {
    if (!seen.has(c.ko)) {
      seen.add(c.ko);
      out.push(c.ko);
    }
  }
  return out;
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
    (w) => w.id !== word.id && w.ko !== word.ko && !shareGroup(word, w),
  );
  const samePos = shuffle(eligible.filter((w) => w.pos === word.pos), rng);
  const otherPos = shuffle(eligible.filter((w) => w.pos !== word.pos), rng);

  const seen = new Set([word.ko]);
  const distractors = [
    ...uniqueKo(samePos, seen),
    ...uniqueKo(otherPos, seen),
  ].slice(0, 3);

  const options = shuffle([word.ko, ...distractors], rng);
  return { options, answerIndex: options.indexOf(word.ko) };
}
