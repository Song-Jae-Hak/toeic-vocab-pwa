// Efraimidis–Spirakis: weighted sampling without replacement.
export function weightedSample(items, weightOf, n, rng) {
  const keyed = items.map((item) => ({
    item,
    key: Math.pow(rng(), 1 / weightOf(item)),
  }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, Math.min(n, items.length)).map((k) => k.item);
}
