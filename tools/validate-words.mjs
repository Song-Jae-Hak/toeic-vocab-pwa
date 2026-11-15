import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const POS = new Set(['n', 'v', 'adj', 'adv', 'prep', 'conj']);

export function validateWords(words, { idCheck = true } = {}) {
  const problems = [];
  const seenEn = new Map();
  const groups = new Map();
  const required = idCheck ? ['id', 'en', 'pos', 'ko'] : ['en', 'pos', 'ko'];

  words.forEach((w, i) => {
    const label = `#${i + 1} (${w.en ?? '?'})`;
    for (const f of required) {
      if (w[f] === undefined || w[f] === null) problems.push(`${label}: missing field ${f}`);
    }
    if (idCheck && w.id !== i + 1) problems.push(`${label}: id should be ${i + 1}, got ${w.id}`);
    if (w.pos !== undefined && !POS.has(w.pos)) problems.push(`${label}: bad pos "${w.pos}"`);
    if (typeof w.en === 'string') {
      const key = w.en.trim().toLowerCase();
      if (seenEn.has(key)) problems.push(`${label}: duplicate en (first at #${seenEn.get(key)})`);
      else seenEn.set(key, i + 1);
    }
    if (typeof w.ko === 'string') {
      if (w.ko.trim() === '') problems.push(`${label}: empty ko`);
      else if (/^[A-Za-z\s]+$/.test(w.ko)) problems.push(`${label}: ko is latin letters only`);
    }
    if (w.group) {
      for (const g of w.group.split('+')) groups.set(g, (groups.get(g) ?? 0) + 1);
    }
  });

  for (const [g, n] of idCheck ? groups : []) {
    if (n < 2) problems.push(`group "${g}" has only one word`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, flag] = process.argv.slice(2);
  const words = JSON.parse(readFileSync(file, 'utf8'));
  const problems = validateWords(words, { idCheck: flag !== '--no-id' });
  if (problems.length) {
    console.error(problems.slice(0, 50).join('\n'));
    console.error(`${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`OK: ${words.length} words`);
}
