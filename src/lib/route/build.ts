import type {
  Candidate,
  IntentEcho,
  Locality,
  ProviderExplainability,
  Route,
  RouteRequest,
  SlotName,
  Stop,
  TraceEntry,
} from '../providers/types'
import { assessSignal } from './assess'
import { buildNarrative } from './narrative'
import { isOpenDuring } from './open-tonight'
import { routeId } from './id'
import { orderStops } from './order'
import { MIN_STOPS, phasesFor } from './phases'
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
  intentEcho: IntentEcho
}

export type BuildFailure = {
  error: 'insufficient'
  unfilledSlots: SlotName[]
  reason: string
}

/**
 * main first: it anchors the plan geographically, so it gets the best of the
 * pool and everything else clusters around it. The rest follow in the plan's
 * own chronological order.
 */
function fillOrder(phases: SlotName[]): SlotName[] {
  return ['main', ...phases.filter((p) => p !== 'main')]
}

/** How many main-slot candidates to try as the anchor. */
const ANCHOR_CANDIDATES = 5

/** A kilometre of extra walking is worth this much route score. */
const WALK_COST_PER_KM = 0.05

type Attempt = {
  chosen: Partial<Record<SlotName, Candidate>>
  takenIds: Set<string>
  totalScore: number
  unfilledSlots: SlotName[]
}

/**
 * Fill the plan's phases, clustering the rest around the given anchor.
 * Returns what it managed, so the caller can compare attempts — and so a
 * phase nothing fits can be dropped rather than failing the whole plan.
 */
function fillFrom(
  pool: Candidate[],
  anchorCandidate: Candidate | undefined,
  input: BuildInput,
  phases: SlotName[],
): Attempt {
  const chosen: Partial<Record<SlotName, Candidate>> = {}
  const usedCategories: string[] = []
  const takenIds = new Set<string>()
  const unfilledSlots: SlotName[] = []
  let totalScore = 0
  let anchor: { lat: number | null; lng: number | null } | undefined

  for (const slot of fillOrder(phases)) {
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

function totalWalk(chosen: Partial<Record<SlotName, Candidate>>): number {
  const ordered = orderStops(chosen)
  return ordered
    .slice(1)
    .reduce((sum, s) => sum + (s.walkFromPrev?.metres ?? UNKNOWN_LEG_M), 0)
}

export function buildRoute(input: BuildInput): Route | BuildFailure {
  const assessment = assessSignal(input.candidates)
  // The shape of the plan comes from the hours the person gave us. A window
  // starting at ten in the morning earns a different plan from one starting
  // at nine at night, and nobody should have to say so twice.
  const phases = phasesFor(input.request.timeWindow)
  // A stated ceiling is a requirement, not a preference, so our own code holds
  // it rather than trusting the Qloo filter to survive. It has to: four places
  // in five publish no price level, so `filter.price_level.max` empties slots
  // and the relaxation path gives it up — and the moment it does, nothing else
  // was stopping a place Qloo had already told us was ₦₦₦₦.
  //
  // Unknown is unknown. A place with no published price level stays in, which
  // is the half of this the ceiling cannot deliver, and the echo says so.
  const budget = input.request.intent.budget
  const pool = input.candidates.filter(
    (c) =>
      c.isClosed !== true &&
      !(budget !== undefined && typeof c.priceLevel === 'number' && c.priceLevel > budget),
  )

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
      ? anchorOptions.map((anchorCandidate) => fillFrom(pool, anchorCandidate, input, phases))
      : [fillFrom(pool, undefined, input, phases)]

  // A phase nothing fits is dropped, not fatal. Asking for a club at two in
  // the morning in a city where Qloo lists none should still get you dinner
  // and a bar — but main is the anchor, so a plan without it is not a plan.
  const stopsIn = (a: Attempt) => phases.length - a.unfilledSlots.length
  const usable = attempts.filter(
    (a) => a.chosen.main !== undefined && stopsIn(a) >= MIN_STOPS,
  )

  if (usable.length === 0) {
    // Report the attempt that got furthest, so the message names a real gap.
    const best = attempts.reduce((a, b) =>
      b.unfilledSlots.length < a.unfilledSlots.length ? b : a,
    )
    return {
      error: 'insufficient',
      unfilledSlots: best.unfilledSlots,
      reason: `Could not fill the ${best.unfilledSlots.join(' or ')} part of the plan from what Qloo returned.`,
    }
  }

  // Price the walking in, then take the best whole evening. Ties break on the
  // stop ids so the same pool always yields the same route.
  const best = usable.reduce((a, b) => {
    // A fuller plan beats a better-scoring shorter one: somebody who asked
    // for a whole day wants the whole day.
    if (stopsIn(b) !== stopsIn(a)) return stopsIn(b) > stopsIn(a) ? b : a
    const value = (x: Attempt) =>
      x.totalScore - (totalWalk(x.chosen) / 1000) * WALK_COST_PER_KM
    const diff = value(b) - value(a)
    if (diff > 0) return b
    if (diff < 0) return a
    return b.chosen.main!.id.localeCompare(a.chosen.main!.id) < 0 ? b : a
  })

  const { chosen, takenIds } = best
  const filledPhases = phases.filter((p) => chosen[p] !== undefined)

  const ordered = orderStops(chosen)
  const whyCtx = {
    requestedTagIds: input.requestedTagIds,
    locality: input.locality.name,
    explainability: input.explainability,
    seedNames: input.seedNames,
  }

  // Derived from the same parser the score uses, so the card cannot disagree
  // with the ranking. Every candidate the client can end up showing goes
  // through this — a stop and an alternative alike, because an alternative
  // becomes a stop the moment somebody swaps it in, and it carried no
  // opening-hours verdict with it.
  const withOpenTonight = (c: Candidate): Candidate => ({
    ...c,
    detail: {
      ...c.detail,
      openTonight: isOpenDuring(c.hours, input.request.timeWindow),
    },
  })

  const stops = ordered.map((o, i) => {
    const { why, evidence } = buildWhy(o.candidate, whyCtx)
    const candidate = withOpenTonight(o.candidate)
    return {
      order: i + 1,
      slot: o.slot,
      candidate,
      why,
      evidence,
      ...(o.walkFromPrev ? { walkFromPrev: o.walkFromPrev } : {}),
    } satisfies Stop
  })

  // A route that could not honour a stated need is not a confident route,
  // whatever the taste match looks like.
  const requirementDropped = input.intentEcho.ignored.some((i) => i.label === 'Must-haves')
  // Sample data cannot honour anything the person stated, so any reported
  // drop on that path is enough to make the route not a confident one.
  const sampleDataDropped =
    input.providerKind === 'fixture' && input.intentEcho.ignored.length > 0
  const confidence = requirementDropped || sampleDataDropped ? 'weak' : assessment.confidence

  const narrative = buildNarrative(stops, input.request.timeWindow)

  // Runners-up, scored when the route was built. Filtered here so the client
  // cannot assemble an invalid route: no place already used, and no category
  // another stop holds.
  const ALTERNATIVES_PER_SLOT = 6
  // main is filled first, so it is the anchor the rest of the route clustered
  // around. Alternatives are scored against the same point.
  const anchor =
    chosen.main!.lat != null && chosen.main!.lng != null
      ? { lat: chosen.main!.lat, lng: chosen.main!.lng }
      : undefined
  const alternativesBySlot = filledPhases.reduce(
    (acc, slot) => {
      const usedByOthers = filledPhases
        .filter((s) => s !== slot)
        .map((s) => chosen[s]?.category)
        .filter((c): c is string => !!c)
      acc[slot] = pool
        .filter(
          (c) =>
            !takenIds.has(c.id) &&
            slotsFor(c).includes(slot) &&
            !usedByOthers.includes(c.category ?? ''),
        )
        .map((c) => ({
          c,
          score: scoreCandidate(c, slot, {
            requestedTagIds: input.requestedTagIds,
            timeWindow: input.request.timeWindow,
            usedCategories: usedByOthers,
            anchor,
          }),
        }))
        .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
        .slice(0, ALTERNATIVES_PER_SLOT)
        .map((e) => withOpenTonight(e.c))
      return acc
    },
    {} as Partial<Record<SlotName, Candidate[]>>,
  )

  // Everything else Qloo returned that is a going-out place at all, scored
  // and shown. A plan is three to five stops; the pool behind it is often
  // forty, and hiding that made the app look like it had found less than it
  // had. Places already offered as a swap are left out, so the list is
  // additional rather than a repeat.
  const MORE_PLACES = 12
  const offered = new Set(
    Object.values(alternativesBySlot)
      .flat()
      .map((c) => c.id),
  )
  const alternatives = pool
    .filter((c) => !takenIds.has(c.id) && !offered.has(c.id) && slotsFor(c).length > 0)
    .map((c) => ({
      c,
      score: scoreCandidate(c, 'main', {
        requestedTagIds: input.requestedTagIds,
        timeWindow: input.request.timeWindow,
        usedCategories: [],
        anchor,
      }),
    }))
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
    .slice(0, MORE_PLACES)
    .map((e) => withOpenTonight(e.c))

  return {
    id: routeId(
      input.locality.name,
      stops.map((s) => s.candidate.id),
    ),
    locality: input.locality,
    mood: input.request.mood,
    createdAt: new Date().toISOString(),
    stops,
    confidence,
    alternatives,
    trace: input.trace,
    providerKind: input.providerKind,
    // The phases this plan asked for and could not fill. The UI says so
    // rather than quietly presenting a shorter plan as the whole answer.
    unfilledSlots: phases.filter((p) => chosen[p] === undefined),
    intentEcho: input.intentEcho,
    narrative,
    narrativeWindow: input.request.timeWindow,
    alternativesBySlot,
  }
}
