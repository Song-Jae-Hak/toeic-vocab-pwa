// Long-term learning stats: per word right/wrong counts and per day answered counts.
export function emptyStats() {
  return { words: {}, days: {} };
}

export function recordStat(stats, id, correct, date) {
  const w = stats.words[id] ?? { right: 0, wrong: 0 };
  const d = stats.days[date] ?? { n: 0, right: 0 };
  return {
    words: { ...stats.words, [id]: { right: w.right + (correct ? 1 : 0), wrong: w.wrong + (correct ? 0 : 1) } },
    days: { ...stats.days, [date]: { n: d.n + 1, right: d.right + (correct ? 1 : 0) } },
  };
}

function dayString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function previousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dayString(new Date(y, m - 1, d - 1));
}

export function summary(stats, today) {
  const days = Object.values(stats.days);
  const totalAnswered = days.reduce((a, d) => a + d.n, 0);
  const right = days.reduce((a, d) => a + d.right, 0);
  let streak = 0;
  let cursor = (stats.days[today]?.n ?? 0) > 0 ? today : previousDay(today);
  while ((stats.days[cursor]?.n ?? 0) > 0) {
    streak++;
    cursor = previousDay(cursor);
  }
  return {
    totalAnswered,
    accuracy: totalAnswered ? Math.round((right / totalAnswered) * 100) : 0,
    streak,
    daysStudied: days.filter((d) => d.n > 0).length,
  };
}

export function topWrong(stats, limit) {
  return Object.entries(stats.words)
    .map(([id, w]) => ({ id: Number(id), wrong: w.wrong, right: w.right }))
    .filter((w) => w.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.right / (a.right + a.wrong) - b.right / (b.right + b.wrong) || a.id - b.id)
    .slice(0, limit);
}
