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

export function buildRoute(input: BuildInput): Route | BuildFailure {
  const assessment = assessSignal(input.candidates)

  const pool = input.candidates.filter((c) => c.isClosed !== true)
  const chosen = {} as Record<SlotName, Candidate>
  const usedCategories: string[] = []
  const takenIds = new Set<string>()
  const unfilledSlots: SlotName[] = []

  for (const slot of FILL_ORDER) {
    const ctx: ScoreContext = {
      requestedTagIds: input.requestedTagIds,
      timeWindow: input.request.timeWindow,
      usedCategories,
    }

    const eligible = pool
      .filter((c) => !takenIds.has(c.id) && slotsFor(c).includes(slot))
      .map((c) => ({ c, score: scoreCandidate(c, slot, ctx) }))
      // id is the tiebreak so the same pool always yields the same route.
      .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))

    const winner = eligible[0]?.c
    if (!winner) {
      unfilledSlots.push(slot)
      continue
    }

    chosen[slot] = winner
    takenIds.add(winner.id)
    if (winner.category) usedCategories.push(winner.category)
  }

  if (unfilledSlots.length > 0) {
    return {
      error: 'insufficient',
      unfilledSlots,
      reason: `Could not fill the ${unfilledSlots.join(' or ')} part of the evening from what Qloo returned.`,
    }
  }

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
  }
}
