import { buildNarrative } from './narrative'
import { orderStops } from './order'
import type { Candidate, Route, SlotName, Stop } from '../providers/types'

const ALTERNATIVES_PER_SLOT = 4

/**
 * Swapping is pure and costs nothing: the alternatives were scored when the
 * route was built, so changing a stop makes no Qloo call and spends no model
 * round. The server already filtered the list for duplicate places and
 * categories, so a swap cannot assemble an invalid route.
 */
export function swapStop(route: Route, slot: SlotName, candidateId: string): Route {
  const replacement = route.alternativesBySlot[slot]?.find((c) => c.id === candidateId)
  const current = route.stops.find((s) => s.slot === slot)
  if (!replacement || !current) return route

  const chosen = route.stops.reduce(
    (acc, s) => {
      acc[s.slot] = s.slot === slot ? replacement : s.candidate
      return acc
    },
    {} as Record<SlotName, Candidate>,
  )

  const bySlot = new Map(route.stops.map((s) => [s.slot, s]))

  const stops = orderStops(chosen).map((o, i) => {
    const previous = bySlot.get(o.slot)!
    const base: Stop =
      o.slot === slot
        ? {
            ...previous,
            candidate: replacement,
            // The reason belonged to the place that left, so it goes with it.
            // A swapped-in stop states what it is and nothing more.
            why: `A ${replacement.category?.replace(/_/g, ' ') ?? 'place'} in ${route.locality.name}.`,
            evidence: [],
          }
        : previous
    return {
      ...base,
      order: (i + 1) as 1 | 2 | 3,
      walkFromPrev: o.walkFromPrev,
    }
  }) as [Stop, Stop, Stop]

  // The lists were filtered against the three stops that existed when the
  // route was built. One swap makes that description stale, and a stale list
  // is not merely untidy: a venue Qloo classifies as a restaurant can still
  // call itself a lounge, so a second swap could put two lounges in one
  // evening. Re-apply both invariants against the route as it now stands.
  const byId = new Map(stops.map((st) => [st.candidate.id, st.slot]))
  const alternativesBySlot = (['open', 'main', 'close'] as const).reduce(
    (acc, s) => {
      const offered =
        s === slot
          ? [current.candidate, ...route.alternativesBySlot[s]]
          : route.alternativesBySlot[s]
      const usedByOthers = stops
        .filter((st) => st.slot !== s)
        .map((st) => st.candidate.category)
        .filter((c): c is string => !!c)
      const seen = new Set<string>()
      acc[s] = offered
        .filter((c) => {
          if (byId.has(c.id) || seen.has(c.id)) return false
          if (usedByOthers.includes(c.category ?? '')) return false
          seen.add(c.id)
          return true
        })
        .slice(0, ALTERNATIVES_PER_SLOT)
      return acc
    },
    { open: [], main: [], close: [] } as Record<SlotName, Candidate[]>,
  )

  return {
    ...route,
    stops,
    narrative: buildNarrative(stops, route.narrativeWindow),
    alternativesBySlot,
  }
}
