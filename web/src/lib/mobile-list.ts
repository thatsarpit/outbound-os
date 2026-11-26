export function nextMobilePage(page: { page: number; pages: number }): number | undefined {
  return page.page < page.pages ? page.page + 1 : undefined
}

// Records can move between offset pages as replies or assignments come in.
export function loadedMobileRows<T>(pages: T[][], getId: (row: T) => number): T[] {
  const rows = new Map<number, T>()
  for (const page of pages) {
    for (const row of page) {
      const id = getId(row)
      if (!rows.has(id)) rows.set(id, row)
    }
  }
  return [...rows.values()]
}
