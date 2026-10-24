import type { TimeWindow } from './window'

/**
 * Qloo returns hours as a weekday map, each day an array of
 * `{ opens: "T17:00:00" | null, closed: boolean, closes: "T23:30:00" | null }`.
 * We do not know which day the outing falls on, so we take the union of every
 * published open range and ask whether any of them overlaps the window.
 */
export function openRanges(hours: unknown): { from: number; to: number }[] {
  if (hours == null || typeof hours !== 'object') return []
  const ranges: { from: number; to: number }[] = []

  for (const day of Object.values(hours as Record<string, unknown>)) {
    if (!Array.isArray(day)) continue
    for (const entry of day) {
      const e = entry as { opens?: unknown; closes?: unknown; closed?: unknown }
      if (e.closed === true) continue
      const from = parseHour(e.opens)
      const to = parseHour(e.closes)
      if (from == null || to == null) continue
      // A close time at or before the open time means it runs past midnight.
      ranges.push({ from, to: to <= from ? to + 24 : to })
    }
  }
  return ranges
}

export function parseHour(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const m = /T?(\d{1,2}):/.exec(raw)
  if (!m) return null
  const hour = Number(m[1])
  return Number.isFinite(hour) ? hour : null
}

const overlaps = (r: { from: number; to: number }, w: TimeWindow) =>
  r.from < w.endHour && r.to > w.startHour

/**
 * Whether a place is open during the window, or null when it publishes no
 * usable hours. The stop card and the score both read this, so the card can
 * never claim something the score disagrees with.
 *
 * Both sides can run past midnight — a window of 22:00-02:00 arrives as 22-26,
 * and a venue open 20:00-02:00 as 20-26 — so each range is also tried shifted
 * a day forward.
 */
export function isOpenDuring(hours: unknown, w: TimeWindow): boolean | null {
  const ranges = openRanges(hours)
  if (ranges.length === 0) return null
  return ranges.some(
    (r) => overlaps(r, w) || overlaps({ from: r.from + 24, to: r.to + 24 }, w),
  )
}
