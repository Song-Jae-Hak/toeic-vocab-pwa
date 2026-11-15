// Keeps every word's id stable across re-merges: known words (by lowercase en) keep their id,
// new words get ids above the largest id ever seen. Removed ids are never reused.
export function assignIds(words, existing) {
  const known = new Map(existing.map((w) => [w.en.trim().toLowerCase(), w.id]));
  let next = existing.reduce((m, w) => Math.max(m, w.id), 0) + 1;
  return words.map((w) => {
    const key = w.en.trim().toLowerCase();
    const id = known.has(key) ? known.get(key) : next++;
    return { ...w, id };
  });
}
