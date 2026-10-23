import type { Candidate, SlotName } from '../providers/types'
import { haversineMetres } from './order'
import { slotFit } from './slots'

export type ScoreContext = {
  requestedTagIds: string[]
  timeWindow: { startHour: number; endHour: number }
  usedCategories: string[]
  /** The first chosen stop. Later stops are pulled towards it. */
  anchor?: { lat: number | null; lng: number | null }
}

const WEIGHTS = {
  affinity: 0.35,
  tag: 0.25,
  slot: 0.13,
  proximity: 0.15,
  descriptor: 0.08,
  popularity: 0.04,
} as const

/** Full marks within a block, nothing beyond a 3km walk. */
const PROXIMITY_RANGE_M = 3000

const PENALTY = {
  duplicateCategory: 0.25,
  closed: 0.5,
  outsideWindow: 0.3,
} as const

function tagMatch(c: Candidate, requestedTagIds: string[]): number | null {
  if (requestedTagIds.length === 0) return null
  const own = new Set(c.tags.map((t) => t.id))
  const hits = requestedTagIds.filter((id) => own.has(id)).length
  return hits / requestedTagIds.length
}

/**
 * Without an anchor this returns null, so the weight redistributes and the
 * first stop is chosen on taste alone rather than on an arbitrary origin.
 */
function proximity(
  c: Candidate,
  anchor: ScoreContext['anchor'],
): number | null {
  if (!anchor) return null
  const metres = haversineMetres({ lat: c.lat, lng: c.lng }, anchor)
  if (metres == null) return null
  return Math.max(0, 1 - metres / PROXIMITY_RANGE_M)
}

function descriptorMatch(c: Candidate): number | null {
  const filled = [
    c.descriptors.goodFor,
    c.descriptors.ambience,
    c.descriptors.cuisine,
    c.descriptors.liveMusic,
  ].filter((v) => typeof v === 'string' && v.length > 0).length
  if (filled === 0) return null
  return Math.min(1, filled / 3)
}

/**
 * Qloo returns hours as a weekday map, each day an array of
 * `{ opens: "T17:00:00" | null, closed: boolean, closes: "T23:30:00" | null }`.
 * We do not know which day the outing falls on, so we take the union of every
 * published open range and ask whether any of them overlaps the window.
 */
function openRanges(hours: unknown): { from: number; to: number }[] {
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

function parseHour(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const m = /T?(\d{1,2}):/.exec(raw)
  if (!m) return null
  const hour = Number(m[1])
  return Number.isFinite(hour) ? hour : null
}

/**
 * True only when the venue publishes hours AND none of them reach the
 * requested window. A venue with no published hours is missing data, not
 * evidence that it is shut.
 */
function outsideWindow(c: Candidate, w: ScoreContext['timeWindow']): boolean {
  const ranges = openRanges(c.hours)
  if (ranges.length === 0) return false
  return !ranges.some((r) => r.from < w.endHour && r.to > w.startHour)
}

export function scoreCandidate(
  c: Candidate,
  slot: SlotName,
  ctx: ScoreContext,
): number {
  const terms: { weight: number; value: number }[] = []
  const push = (weight: number, value: number | null) => {
    if (value === null || !Number.isFinite(value)) return
    terms.push({ weight, value: Math.max(0, Math.min(1, value)) })
  }

  push(WEIGHTS.affinity, c.affinity)
  push(WEIGHTS.tag, tagMatch(c, ctx.requestedTagIds))
  push(WEIGHTS.slot, slotFit(c, slot))
  push(WEIGHTS.proximity, proximity(c, ctx.anchor))
  push(WEIGHTS.descriptor, descriptorMatch(c))
  push(WEIGHTS.popularity, c.popularity)

  const totalWeight = terms.reduce((s, t) => s + t.weight, 0)
  let score =
    totalWeight === 0
      ? 0
      : terms.reduce((s, t) => s + (t.weight / totalWeight) * t.value, 0)

  if (c.isClosed === true) score -= PENALTY.closed
  if (c.category && ctx.usedCategories.includes(c.category)) {
    score -= PENALTY.duplicateCategory
  }
  if (outsideWindow(c, ctx.timeWindow)) score -= PENALTY.outsideWindow

  return score
}
