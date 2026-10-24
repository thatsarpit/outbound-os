type FeedItem = { id: string; timestamp: string; read: boolean }

/** A completed request cannot consume events that arrived after its displayed watermark. */
export function readNotificationFeedThrough<T extends FeedItem>(
  items: T[],
  throughId: number,
): T[] {
  return items.map((item) =>
    /^[1-9]\d*$/.test(item.id) && Number(item.id) <= throughId ? { ...item, read: true } : item,
  )
}

/** Stable identities and newest-first ordering are applied before the visible limit. */
export function mergeNotificationFeed<T extends FeedItem>(
  existing: T[],
  incoming: T[],
  limit = 12,
): T[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) {
    const previous = byId.get(item.id)
    byId.set(item.id, { ...previous, ...item, read: Boolean(previous?.read || item.read) })
  }
  return [...byId.values()]
    .sort((a, b) => {
      const difference = (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
      return difference || b.id.localeCompare(a.id, undefined, { numeric: true })
    })
    .slice(0, limit)
}
