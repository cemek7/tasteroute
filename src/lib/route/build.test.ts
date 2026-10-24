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
