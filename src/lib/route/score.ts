import type { Candidate, SlotName } from '../providers/types'
import { slotFit } from './slots'

export type ScoreContext = {
  requestedTagIds: string[]
  timeWindow: { startHour: number; endHour: number }
  usedCategories: string[]
}

const WEIGHTS = {
  affinity: 0.4,
  tag: 0.3,
  slot: 0.15,
  descriptor: 0.1,
  popularity: 0.05,
} as const

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

/** True when the venue is known to be shut during the whole requested window. */
function outsideWindow(c: Candidate, w: ScoreContext['timeWindow']): boolean {
  if (c.hours == null) return false
  const h = c.hours as { openHour?: number; closeHour?: number }
  if (typeof h.openHour !== 'number' || typeof h.closeHour !== 'number') return false
  return h.closeHour <= w.startHour || h.openHour >= w.endHour
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
