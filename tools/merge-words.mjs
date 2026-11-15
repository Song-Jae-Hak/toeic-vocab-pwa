import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { validateWords } from './validate-words.mjs';

const dir = new URL('../data/raw/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^words-\d+\.json$/.test(f)).sort();
const merged = [];
for (const f of files) {
  merged.push(...JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}
const words = merged.map((w, i) => ({ id: i + 1, ...w }));
const problems = validateWords(words);
if (problems.length) {
  console.error(problems.slice(0, 80).join('\n'));
  console.error(`${problems.length} problem(s) — data/words.json not written`);
  process.exit(1);
}
writeFileSync(new URL('../data/words.json', import.meta.url), JSON.stringify(words));
console.log(`Merged ${files.length} files → ${words.length} words`);
