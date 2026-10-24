import type {
  Candidate,
  Locality,
  ProviderExplainability,
  Route,
  RouteRequest,
  SlotName,
  Stop,
  TraceEntry,
} from '../providers/types'
import { assessSignal } from './assess'
import { orderStops } from './order'
import { scoreCandidate, type ScoreContext } from './score'
import { slotsFor } from './slots'
import { buildWhy } from './why'

export type BuildInput = {
  candidates: Candidate[]
  request: RouteRequest
  locality: Locality
  requestedTagIds: string[]
  explainability: ProviderExplainability | null
  seedNames: Record<string, string>
  trace: TraceEntry[]
  providerKind: 'qloo' | 'fixture'
}

export type BuildFailure = {
  error: 'insufficient'
  unfilledSlots: SlotName[]
  reason: string
}

/** main first: it anchors the evening, so it gets the best of the pool. */
const FILL_ORDER: SlotName[] = ['main', 'close', 'open']

/** How many main-slot candidates to try as the anchor. */
const ANCHOR_CANDIDATES = 5

/** A kilometre of extra walking is worth this much route score. */
const WALK_COST_PER_KM = 0.05

type Attempt = {
  chosen: Record<SlotName, Candidate>
  takenIds: Set<string>
  totalScore: number
  unfilledSlots: SlotName[]
}

/**
 * Fill the three slots, clustering the second and third around the given
 * anchor. Returns what it managed, so the caller can compare attempts.
 */
function fillFrom(
  pool: Candidate[],
  anchorCandidate: Candidate | undefined,
  input: BuildInput,
): Attempt {
  const chosen = {} as Record<SlotName, Candidate>
  const usedCategories: string[] = []
  const takenIds = new Set<string>()
  const unfilledSlots: SlotName[] = []
  let totalScore = 0
  let anchor: { lat: number | null; lng: number | null } | undefined

  for (const slot of FILL_ORDER) {
    const ctx: ScoreContext = {
      requestedTagIds: input.requestedTagIds,
      timeWindow: input.request.timeWindow,
      usedCategories,
      anchor,
    }

    const eligible = pool
      .filter((c) => !takenIds.has(c.id) && slotsFor(c).includes(slot))
      .map((c) => ({ c, score: scoreCandidate(c, slot, ctx) }))
      // id is the tiebreak so the same pool always yields the same route.
      .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))

    // The anchor is forced for its own slot; the rest compete normally.
    const forced =
      slot === 'main' && anchorCandidate
        ? eligible.find((e) => e.c.id === anchorCandidate.id)
        : undefined
    const winner = forced ?? eligible[0]

    if (!winner) {
      unfilledSlots.push(slot)
      continue
    }

    chosen[slot] = winner.c
    totalScore += winner.score
    takenIds.add(winner.c.id)
    if (winner.c.category) usedCategories.push(winner.c.category)
    if (!anchor && winner.c.lat != null && winner.c.lng != null) {
      anchor = { lat: winner.c.lat, lng: winner.c.lng }
    }
  }

  return { chosen, takenIds, totalScore, unfilledSlots }
}

/**
 * Total walking distance across the ordered stops, in metres. A leg we cannot
 * measure is priced at UNKNOWN_LEG_M rather than 0: counting it as free made a
 * route of coordinate-less venues look like a zero-walk evening and win.
 */
const UNKNOWN_LEG_M = 3000

function totalWalk(chosen: Record<SlotName, Candidate>): number {
  const ordered = orderStops(chosen)
  return ordered
    .slice(1)
    .reduce((sum, s) => sum + (s.walkFromPrev?.metres ?? UNKNOWN_LEG_M), 0)
}

export function buildRoute(input: BuildInput): Route | BuildFailure {
  const assessment = assessSignal(input.candidates)
  const pool = input.candidates.filter((c) => c.isClosed !== true)

  // The highest-scoring restaurant can sit in a far suburb, which drags the
  // whole evening out there. Try the best few as the anchor and keep the route
  // that is best overall once walking is priced in.
  const mainCtx: ScoreContext = {
    requestedTagIds: input.requestedTagIds,
    timeWindow: input.request.timeWindow,
    usedCategories: [],
  }
  const anchorOptions = pool
    .filter((c) => slotsFor(c).includes('main'))
    .map((c) => ({ c, score: scoreCandidate(c, 'main', mainCtx) }))
    // A located anchor comes first regardless of score: without coordinates
    // the whole route loses its walking information and its clustering.
    .sort((a, b) => {
      const located = (x: Candidate) => (x.lat != null && x.lng != null ? 1 : 0)
      return (
        located(b.c) - located(a.c) ||
        b.score - a.score ||
        a.c.id.localeCompare(b.c.id)
      )
    })
    .slice(0, ANCHOR_CANDIDATES)
    .map((e) => e.c)

  // With no main-eligible venue at all, still run one unanchored pass so the
  // failure names the slots that are genuinely empty rather than all three.
  const attempts =
    anchorOptions.length > 0
      ? anchorOptions.map((anchorCandidate) => fillFrom(pool, anchorCandidate, input))
      : [fillFrom(pool, undefined, input)]

  const complete = attempts.filter((a) => a.unfilledSlots.length === 0)

  if (complete.length === 0) {
    // Report the attempt that got furthest, so the message names a real gap.
    const best = attempts.reduce((a, b) =>
      b.unfilledSlots.length < a.unfilledSlots.length ? b : a,
    )
    return {
      error: 'insufficient',
      unfilledSlots: best.unfilledSlots,
      reason: `Could not fill the ${best.unfilledSlots.join(' or ')} part of the evening from what Qloo returned.`,
    }
  }

  // Price the walking in, then take the best whole evening. Ties break on the
  // stop ids so the same pool always yields the same route.
  const best = complete.reduce((a, b) => {
    const value = (x: Attempt) =>
      x.totalScore - (totalWalk(x.chosen) / 1000) * WALK_COST_PER_KM
    const diff = value(b) - value(a)
    if (diff > 0) return b
    if (diff < 0) return a
    return b.chosen.main.id.localeCompare(a.chosen.main.id) < 0 ? b : a
  })

  const { chosen, takenIds } = best

  const ordered = orderStops(chosen)
  const whyCtx = {
    requestedTagIds: input.requestedTagIds,
    locality: input.locality.name,
    explainability: input.explainability,
    seedNames: input.seedNames,
  }

  const stops = ordered.map((o, i) => {
    const { why, evidence } = buildWhy(o.candidate, whyCtx)
    return {
      order: (i + 1) as 1 | 2 | 3,
      slot: o.slot,
      candidate: o.candidate,
      why,
      evidence,
      ...(o.walkFromPrev ? { walkFromPrev: o.walkFromPrev } : {}),
    } satisfies Stop
  }) as [Stop, Stop, Stop]

  const alternatives =
    assessment.confidence === 'weak'
      ? pool.filter((c) => !takenIds.has(c.id)).slice(0, 6)
      : []

  return {
    id: `${input.locality.name.toLowerCase().replace(/\s+/g, '-')}-${stops
      .map((s) => s.candidate.id)
      .join('_')}`,
    locality: input.locality,
    mood: input.request.mood,
    createdAt: new Date().toISOString(),
    stops,
    confidence: assessment.confidence,
    alternatives,
    trace: input.trace,
    providerKind: input.providerKind,
    unfilledSlots: [],
    intentEcho: { applied: [], ignored: [] },
  }
}
