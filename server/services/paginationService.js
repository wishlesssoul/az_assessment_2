const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export function paginate(items, pageValue, pageSizeValue) {
  const totalItems = items.length;
  const requestedPage = Number.parseInt(pageValue, 10);
  const requestedPageSize = Number.parseInt(pageSizeValue, 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(Math.max(requestedPageSize, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const totalPages = Math.ceil(totalItems / pageSize);
  const page = totalPages === 0
    ? 1
    : Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages
    }
  };
}

export function sortNewestFirst(items, dateKey) {
  return items
    .map((item, index) => ({ item, index, timestamp: Date.parse(item[dateKey] || '') || 0 }))
    .sort((left, right) => right.timestamp - left.timestamp || right.index - left.index)
    .map(({ item }) => item);
}
