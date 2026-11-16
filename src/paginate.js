export const PAGE_SIZE = 25;

// Splits a list into pages. The page number is clamped to a valid page; an empty list is one empty page.
export function paginate(items, page, pageSize = PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const n = Math.floor(Number(page));
  const current = Number.isFinite(n) ? Math.min(Math.max(n, 1), pageCount) : 1;
  const from = (current - 1) * pageSize;
  return {
    items: items.slice(from, from + pageSize),
    page: current,
    pageCount,
    total,
    start: total === 0 ? 0 : from + 1,
  };
}
