import type { Candidate, SlotName } from '../providers/types'
import { isOpenDuring } from './open-tonight'
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
  /** Full weight of the across-town penalty, reached at FAR_SPAN_M beyond the range. */
  far: 0.3,
} as const

/**
 * Past the walkable range the proximity term is already zero, so a place 9km
 * away scored exactly like one 3.1km away and the remaining 85% of the weight
 * decided it. A live Abuja plan came back with a 117-minute leg that way.
 *
 * So distance keeps costing after the credit runs out, up to a cap: a great
 * match across the city should lose to a decent one you can reach, but a city
 * whose venues are all spread out still gets a plan rather than nothing.
 */
const FAR_SPAN_M = 5000

function farPenalty(c: Candidate, anchor: ScoreContext['anchor']): number {
  if (!anchor) return 0
  const metres = haversineMetres({ lat: c.lat, lng: c.lng }, anchor)
  // No coordinates is missing data, not evidence of being far away.
  if (metres == null || metres <= PROXIMITY_RANGE_M) return 0
  const over = metres - PROXIMITY_RANGE_M
  return Math.min(PENALTY.far, (PENALTY.far * over) / FAR_SPAN_M)
}

function tagMatch(c: Candidate, requestedTagIds: string[]): number | null {
  if (requestedTagIds.length === 0) return null
  const own = new Set(c.tags.map((t) => t.id))
  const hits = requestedTagIds.filter((id) => own.has(id)).length
  return hits / requestedTagIds.length
}

/**
 * Without an anchor this returns null, so the weight redistributes and the
 * first stop is chosen on taste alone rather than on an arbitrary origin.
 *
 * Once there IS an anchor, a candidate with no coordinates scores
 * UNKNOWN_PROXIMITY rather than null. Redistributing the weight made missing
 * location data a competitive advantage: anything more than about a kilometre
 * from the anchor lost to an otherwise identical candidate that was simply
 * unplaceable.
 */
const UNKNOWN_PROXIMITY = 0.25

function proximity(c: Candidate, anchor: ScoreContext['anchor']): number | null {
  if (!anchor) return null
  const metres = haversineMetres({ lat: c.lat, lng: c.lng }, anchor)
  if (metres == null) return UNKNOWN_PROXIMITY
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
 * True only when the venue publishes hours AND none of them reach the
 * requested window. A venue with no published hours is missing data, not
 * evidence that it is shut.
 */
function outsideWindow(c: Candidate, w: ScoreContext['timeWindow']): boolean {
  return isOpenDuring(c.hours, w) === false
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
  score -= farPenalty(c, ctx.anchor)

  return score
}
