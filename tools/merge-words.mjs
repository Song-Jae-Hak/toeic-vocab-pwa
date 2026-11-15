import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { validateWords } from './validate-words.mjs';
import { assignIds } from './assign-ids.mjs';

const dir = new URL('../data/raw/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^words-\d+\.json$/.test(f)).sort();
const merged = [];
for (const f of files) {
  merged.push(...JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}
const outFile = new URL('../data/words.json', import.meta.url);
const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
const words = assignIds(merged, existing);

// Apply synonym groups from data/groups.json. A word in several groups gets "a+b".
const groups = JSON.parse(readFileSync(new URL('../data/groups.json', import.meta.url), 'utf8'));
const byEn = new Map(words.map((w) => [w.en.toLowerCase(), w]));
for (const [name, members] of Object.entries(groups)) {
  const found = members.map((m) => byEn.get(m.toLowerCase())).filter(Boolean);
  if (found.length < 2) {
    console.log(`skip group "${name}": only ${found.length} member(s) found`);
    continue;
  }
  for (const w of found) {
    w.group = w.group ? `${w.group}+${name}` : name;
  }
}

const problems = validateWords(words);
if (problems.length) {
  console.error(problems.slice(0, 80).join('\n'));
  console.error(`${problems.length} problem(s) — data/words.json not written`);
  process.exit(1);
}
writeFileSync(outFile, JSON.stringify(words));
console.log(`Merged ${files.length} files → ${words.length} words (${words.filter((w) => w.group).length} grouped)`);
