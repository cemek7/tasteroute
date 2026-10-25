import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute, type BuildInput } from './build'
import type { Candidate } from '../providers/types'

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  candidates: FIXTURE_CANDIDATES,
  request: {
    city: 'Lagos',
    mood: 'low-key but not dead',
    timeWindow: { startHour: 18, endHour: 23 }, intent: {},
  },
  locality: { name: 'Lagos' },
  requestedTagIds: [],
  explainability: null,
  seedNames: {},
  trace: [],
  providerKind: 'fixture',
      intentEcho: { applied: [], ignored: [] },
  ...over,
})

describe('buildRoute', () => {
  it('returns exactly three stops in order 1, 2, 3', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.map((s) => s.order)).toEqual([1, 2, 3])
  })

  it('never repeats a place across stops', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    const ids = r.stops.map((s) => s.candidate.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('never repeats a category across stops', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    const cats = r.stops.map((s) => s.candidate.category)
    expect(new Set(cats).size).toBe(3)
  })

  it('does not place a venue eligible for two slots into both', () => {
    // A single place tagged as both restaurant and cocktail bar, scored high
    // enough to win either slot it is eligible for.
    const hybrid: Candidate = {
      ...FIXTURE_CANDIDATES[0],
      id: 'fx-hybrid',
      name: 'Hybrid House',
      category: 'restaurant',
      affinity: 0.99,
      tags: [
        {
          id: 'urn:tag:genre:place:restaurant',
          name: 'Restaurant',
          type: 'urn:tag:genre:place',
          popularity: 0.99,
        },
        {
          id: 'urn:tag:genre:place:restaurant:cocktail_bar',
          name: 'Cocktail Bar',
          type: 'urn:tag:genre:place',
          popularity: 0.99,
        },
      ],
      providerRef: { provider: 'fixture', entityId: 'fx-hybrid' },
    }
    const r = buildRoute(input({ candidates: [...FIXTURE_CANDIDATES, hybrid] }))
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.filter((s) => s.candidate.id === 'fx-hybrid').length).toBeLessThanOrEqual(1)
  })

  it('excludes closed venues', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.some((s) => s.candidate.isClosed === true)).toBe(false)
  })

  it('returns an insufficient error naming the unfilled slot rather than a short route', () => {
    const cafesOnly = FIXTURE_CANDIDATES.filter((c) => c.category === 'cafe')
    const r = buildRoute(input({ candidates: cafesOnly }))
    expect('error' in r).toBe(true)
    if (!('error' in r)) return
    expect(r.unfilledSlots).toContain('main')
    expect(r.unfilledSlots).toContain('close')
  })

  it('carries the provider kind through so the UI can disclose fixtures', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.providerKind).toBe('fixture')
  })

  it('surfaces alternatives when confidence is weak', () => {
    const thin = [
      ...FIXTURE_CANDIDATES.filter((c) => c.category === 'cafe'),
      ...FIXTURE_CANDIDATES.filter((c) => c.category === 'restaurant').slice(0, 2),
      ...FIXTURE_CANDIDATES.filter((c) => c.category === 'cocktail_bar').slice(0, 1),
    ]
    const r = buildRoute(input({ candidates: thin }))
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).toBe('weak')
    expect(r.alternatives.length).toBeGreaterThan(0)
  })

  it('leaves alternatives empty when confidence is strong', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).toBe('strong')
    expect(r.alternatives).toEqual([])
  })

  it('produces identical output for identical input', () => {
    const a = buildRoute(input())
    const b = buildRoute(input())
    if ('error' in a || 'error' in b) throw new Error('expected routes')
    expect(a.stops.map((s) => s.candidate.id)).toEqual(b.stops.map((s) => s.candidate.id))
    expect(a.stops.map((s) => s.why)).toEqual(b.stops.map((s) => s.why))
  })

  it('gives every stop a non-empty reason', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.every((s) => s.why.length > 0)).toBe(true)
  })
})

// Reviewer finding I6: budget reached Qloo as `filter.price_level.max`, and
// the relaxation path gives that filter up when it empties a slot. With no
// price level on the candidate, nothing then stopped a place Qloo had told us
// was ₦₦₦₦ from landing in a route somebody capped at ₦₦.
describe('a stated budget is a ceiling our own code keeps', () => {
  const priced = (
    id: string,
    category: string,
    priceLevel: number | null,
    affinity = 0.9,
  ): Candidate => ({
    id,
    name: id,
    category,
    primaryGenre: `urn:tag:genre:place:${category}`,
    lat: 9.07,
    lng: 7.49,
    address: null,
    affinity,
    popularity: 0.5,
    priceLevel,
    isClosed: false,
    hours: null,
    tags: [],
    descriptors: {},
    providerRank: 1,
    providerRef: { provider: 'fixture', entityId: id },
  })

  const build = (candidates: Candidate[], budget?: 1 | 2 | 3 | 4) =>
    buildRoute({
      candidates,
      request: {
        city: 'Abuja',
        mood: 'anything',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: budget ? { budget } : {},
      },
      locality: { name: 'Abuja' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'qloo',
      // The filter was given up, which is exactly when this has to hold.
      intentEcho: {
        applied: [],
        ignored: budget ? [{ label: 'Budget', reason: 'too few places publish a price level' }] : [],
      },
    } satisfies BuildInput)

  // rest-expensive is the better taste match, so it wins the main slot unless
  // something keeps it out. That is what each case below is testing.
  const pool = (mainPrice: number | null): Candidate[] => [
    priced('cafe-1', 'cafe', 1),
    priced('rest-expensive', 'restaurant', mainPrice, 0.95),
    priced('rest-cheap', 'restaurant', 2, 0.6),
    priced('bar-1', 'cocktail_bar', 1),
  ]

  it('never places a stop Qloo told us exceeds the ceiling', () => {
    const r = build(pool(4), 2)
    if ('error' in r) throw new Error(r.reason)
    expect(r.stops.map((s) => s.candidate.id)).not.toContain('rest-expensive')
  })

  it('keeps the places that publish no price level, since most do not', () => {
    const r = build(pool(null), 2)
    if ('error' in r) throw new Error(r.reason)
    // Nothing is known to break the ceiling, so the best main stop stands.
    expect(r.stops.map((s) => s.candidate.id)).toContain('rest-expensive')
  })

  it('leaves the route alone when no budget was stated', () => {
    const r = build(pool(4))
    if ('error' in r) throw new Error(r.reason)
    expect(r.stops.map((s) => s.candidate.id)).toContain('rest-expensive')
  })

  it('does not offer an over-budget place as an alternative either', () => {
    const r = build([...pool(4), priced('rest-dear-2', 'restaurant', 4, 0.94)], 2)
    if ('error' in r) throw new Error(r.reason)
    const offered = Object.values(r.alternativesBySlot).flat().map((c) => c.id)
    expect(offered).not.toContain('rest-expensive')
    expect(offered).not.toContain('rest-dear-2')
  })
})
