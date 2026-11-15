// Drops later duplicates (by lowercase `en`) across data/raw/words-NN.json, keeping the first.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../data/raw/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^words-\d+\.json$/.test(f)).sort();
const seen = new Set();
for (const f of files) {
  const words = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const kept = words.filter((w) => {
    const k = w.en.trim().toLowerCase();
    if (seen.has(k)) { console.log(`drop ${f}: ${w.en}`); return false; }
    seen.add(k);
    return true;
  });
  if (kept.length !== words.length) {
    writeFileSync(new URL(f, dir), '[\n' + kept.map((w) => JSON.stringify(w)).join(',\n') + '\n]\n');
  }
}
console.log(`unique words: ${seen.size}`);
