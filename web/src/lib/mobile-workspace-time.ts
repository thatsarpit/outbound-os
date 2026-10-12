/** Convert a datetime-local wall clock in the workspace zone to an instant.
 * Reject missing/repeated DST times so a follow-up cannot silently move an hour.
 */
export function workspaceWallTimeToUtc(value: string, timeZone: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) throw new Error('Choose a valid follow-up date and time.')
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const fields = (date: Date) =>
    Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]))
  const offsets = new Set<number>()
  for (const delta of [-36, 0, 36]) {
    const date = new Date(wall + delta * 3600_000)
    const p = fields(date)
    offsets.add(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - date.getTime())
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((date) => {
      const p = fields(date)
      return (
        +p.year === year &&
        +p.month === month &&
        +p.day === day &&
        +p.hour === hour &&
        +p.minute === minute
      )
    })
  if (candidates.length !== 1)
    throw new Error(
      'This time falls in a daylight-saving clock change. Choose a time outside the changing hour.',
    )
  return candidates[0].toISOString()
}
