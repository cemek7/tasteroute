import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute, type BuildInput } from './build'
import { routeId } from './id'
import { swapStop } from './swap'
import type { Candidate, Route, SlotName } from '../providers/types'

const route = (): Route => {
  const r = buildRoute({
    candidates: FIXTURE_CANDIDATES,
    request: {
      city: 'Lagos',
      mood: 'anything',
      timeWindow: { startHour: 18, endHour: 23 },
      intent: {},
    },
    locality: { name: 'Lagos' },
    requestedTagIds: [],
    explainability: null,
    seedNames: {},
    trace: [],
    providerKind: 'fixture',
    intentEcho: { applied: [], ignored: [] },
  } satisfies BuildInput)
  if ('error' in r) throw new Error('expected a route')
  return r
}

const slotWithOptions = (r: Route): SlotName =>
  (['open', 'main', 'close'] as const).find((s) => r.alternativesBySlot[s].length > 0)!

describe('alternativesBySlot', () => {
  it('offers runners-up for at least one slot', () => {
    const r = route()
    expect(Object.values(r.alternativesBySlot).flat().length).toBeGreaterThan(0)
  })

  it('never offers a candidate already in the route', () => {
    const r = route()
    const inRoute = new Set(r.stops.map((s) => s.candidate.id))
    for (const list of Object.values(r.alternativesBySlot)) {
      for (const c of list) expect(inRoute.has(c.id)).toBe(false)
    }
  })

  it('never offers a candidate whose category another stop already uses', () => {
    const r = route()
    for (const slot of ['open', 'main', 'close'] as const) {
      const others = r.stops.filter((s) => s.slot !== slot).map((s) => s.candidate.category)
      for (const c of r.alternativesBySlot[slot]) expect(others).not.toContain(c.category)
    }
  })

  it('never offers a closed venue', () => {
    const r = route()
    for (const list of Object.values(r.alternativesBySlot)) {
      for (const c of list) expect(c.isClosed).not.toBe(true)
    }
  })
})

describe('swapStop', () => {
  it('replaces the named stop and keeps three stops', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const replacement = r.alternativesBySlot[slot][0]
    const next = swapStop(r, slot, replacement.id)
    expect(next.stops).toHaveLength(3)
    expect(next.stops.find((s) => s.slot === slot)?.candidate.id).toBe(replacement.id)
  })

  it('keeps the close slot last after a swap', () => {
    const r = route()
    const slot = slotWithOptions(r)
    expect(swapStop(r, slot, r.alternativesBySlot[slot][0].id).stops.at(-1)?.slot).toBe('close')
  })

  it('renumbers the stops 1, 2, 3', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.stops.map((s) => s.order)).toEqual([1, 2, 3])
  })

  it('rebuilds the narrative for the new set', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(typeof next.narrative.line).toBe('string')
    expect(next.narrative.line.endsWith('.')).toBe(true)
  })

  it('returns the route unchanged for an unknown candidate id', () => {
    const r = route()
    expect(swapStop(r, 'main', 'no-such-place')).toEqual(r)
  })

  it('moves the swapped-out place into the alternatives', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const original = r.stops.find((s) => s.slot === slot)!.candidate.id
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.alternativesBySlot[slot].map((c) => c.id)).toContain(original)
  })

  it('does not offer the newly placed candidate as its own alternative', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const chosen = r.alternativesBySlot[slot][0].id
    const next = swapStop(r, slot, chosen)
    expect(next.alternativesBySlot[slot].map((c) => c.id)).not.toContain(chosen)
  })

  it('gives the new stop a reason rather than inheriting the old one', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const oldWhy = r.stops.find((s) => s.slot === slot)!.why
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.stops.find((s) => s.slot === slot)?.why).not.toBe(oldWhy)
  })
})

// Reviewer finding I5: the stops get `openTonight` injected at build time,
// but the alternatives are raw pool candidates. A swap therefore dropped the
// "closes before your window" warning off the card — the person swapped in a
// place that shuts at 11 and the app went quiet about it.
describe('alternatives carry the same opening-hours verdict as the stops', () => {
  const morningOnly = {
    monday: [{ opens: 'T09:00:00', closes: 'T11:00:00', closed: false }],
  }
  const withHours = () => FIXTURE_CANDIDATES.map((c) => ({ ...c, hours: morningOnly }))

  const routeWithHours = (): Route => {
    const r = buildRoute({
      candidates: withHours(),
      request: {
        city: 'Lagos',
        mood: 'anything',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: {},
      },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
      intentEcho: { applied: [], ignored: [] },
    } satisfies BuildInput)
    if ('error' in r) throw new Error('expected a route')
    return r
  }

  it('answers the open-during-your-window question for every alternative', () => {
    const r = routeWithHours()
    const all = Object.values(r.alternativesBySlot).flat()
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) expect(c.detail?.openTonight).toBe(false)
  })

  it('keeps the warning on a stop that arrived by a swap', () => {
    const r = routeWithHours()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.stops.find((s) => s.slot === slot)?.candidate.detail?.openTonight).toBe(false)
  })
})

// Reviewer finding I8: the alternatives were filtered against the categories
// of the ORIGINAL three stops and never recomputed. One swap left the lists
// describing a route that no longer existed, so a second swap could put two
// lounges in the same evening.
describe('the alternatives still describe the route after a swap', () => {
  const mk = (
    id: string,
    category: string,
    primaryGenre: string | null,
    affinity: number,
  ): Candidate => ({
    id,
    name: id,
    category,
    primaryGenre,
    lat: 9.07,
    lng: 7.49,
    address: null,
    affinity,
    popularity: 0.4,
    isClosed: false,
    hours: null,
    tags: [],
    descriptors: {},
    providerRank: 1,
    providerRef: { provider: 'fixture', entityId: id },
  })

  /**
   * `lounge-main` is the case that makes this reachable from live data: Qloo
   * classified it as a restaurant, so it fills the main slot, but its own
   * category still reads "lounge" — the same word as `lounge-close`.
   */
  const pool = (): Candidate[] => [
    mk('cafe-1', 'cafe', 'urn:tag:genre:place:cafe', 0.9),
    mk('cafe-2', 'cafe', 'urn:tag:genre:place:cafe', 0.5),
    mk('rest-1', 'restaurant', 'urn:tag:genre:place:restaurant', 0.9),
    mk('lounge-main', 'lounge', 'urn:tag:genre:place:restaurant', 0.6),
    mk('bar-1', 'cocktail_bar', 'urn:tag:genre:place:cocktail_bar', 0.9),
    mk('lounge-close', 'lounge', null, 0.6),
  ]

  const crafted = (): Route => {
    const r = buildRoute({
      candidates: pool(),
      request: {
        city: 'Abuja',
        mood: 'anything',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: {},
      },
      locality: { name: 'Abuja' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
      intentEcho: { applied: [], ignored: [] },
    } satisfies BuildInput)
    if ('error' in r) throw new Error('expected a route')
    return r
  }

  it('does not let two swaps put two of the same kind in one evening', () => {
    const two = swapStop(swapStop(crafted(), 'close', 'lounge-close'), 'main', 'lounge-main')
    const kinds = two.stops.map((s) => s.candidate.category)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('stops offering a kind the swapped-in stop now holds', () => {
    const one = swapStop(crafted(), 'close', 'lounge-close')
    for (const slot of ['open', 'main', 'close'] as const) {
      const others = one.stops.filter((s) => s.slot !== slot).map((s) => s.candidate.category)
      for (const c of one.alternativesBySlot[slot]) expect(others).not.toContain(c.category)
    }
  })

  it('offers nothing that is already a stop in the route', () => {
    const one = swapStop(crafted(), 'close', 'lounge-close')
    const inRoute = new Set(one.stops.map((s) => s.candidate.id))
    for (const list of Object.values(one.alternativesBySlot)) {
      for (const c of list) expect(inRoute.has(c.id)).toBe(false)
    }
  })

  it('still offers the place that was swapped out', () => {
    const one = swapStop(crafted(), 'close', 'lounge-close')
    expect(one.alternativesBySlot.close.map((c) => c.id)).toContain('bar-1')
  })

  it('leaves the fixture route own invariants intact', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    for (const s of ['open', 'main', 'close'] as const) {
      const others = next.stops.filter((x) => x.slot !== s).map((x) => x.candidate.category)
      for (const c of next.alternativesBySlot[s]) expect(others).not.toContain(c.category)
    }
  })
})

describe('a swapped route is a different route, so saving it does not overwrite', () => {
  it('takes a new id when a stop changes', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.id).not.toBe(r.id)
  })

  it('builds that id by the same rule buildRoute uses', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.id).toBe(
      routeId(
        next.locality.name,
        next.stops.map((s) => s.candidate.id),
      ),
    )
  })

  it('keeps the id when the swap was refused', () => {
    const r = route()
    expect(swapStop(r, 'open', 'no-such-candidate').id).toBe(r.id)
  })
})
