import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { slotsFor } from './slots'
import { scoreCandidate, type ScoreContext } from './score'
import { buildRoute, type BuildInput } from './build'
import { buildWhy } from './why'
import type { Candidate } from '../providers/types'

const mk = (over: Partial<Candidate>): Candidate => ({
  ...FIXTURE_CANDIDATES[0],
  id: over.id ?? 'x',
  tags: [],
  descriptors: {},
  ...over,
})

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  requestedTagIds: [],
  timeWindow: { startHour: 18, endHour: 23 },
  usedCategories: [],
  ...over,
})

describe('lodging is never an outing stop', () => {
  for (const category of ['hotel', 'apartment', 'hostel', 'resort', 'motel', 'guest_house']) {
    it(`excludes a ${category} from every slot`, () => {
      expect(slotsFor(mk({ id: category, category }))).toEqual([])
    })
  }

  it('keeps a hotel out of a built route even when it scores well', () => {
    const hotel = mk({
      id: 'fx-hotel',
      name: 'Grand Hotel',
      category: 'hotel',
      affinity: 0.99,
      lat: 6.43,
      lng: 3.42,
    })
    const r = buildRoute({
      candidates: [...FIXTURE_CANDIDATES, hotel],
      request: { city: 'Lagos', mood: 'anything', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
    } satisfies BuildInput)
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.some((s) => s.candidate.id === 'fx-hotel')).toBe(false)
  })
})

describe('category comes from the most specific genre tag, not the first', () => {
  it('prefers the deeper urn when a place carries both', () => {
    // Qloo lists a cocktail bar under both the generic restaurant genre and
    // the specific cocktail_bar genre, in no guaranteed order.
    const bar = mk({
      id: 'bar',
      category: null,
      tags: [
        {
          id: 'urn:tag:genre:place:restaurant',
          name: 'Restaurant',
          type: 'urn:tag:genre:place',
          popularity: 1,
        },
        {
          id: 'urn:tag:genre:place:restaurant:cocktail_bar',
          name: 'Cocktail Bar',
          type: 'urn:tag:genre:place',
          popularity: 1,
        },
      ],
    })
    expect(slotsFor(bar)).toEqual(['close'])
  })
})

describe('proximity keeps the stops walkable', () => {
  it('prefers a near candidate over a far one of equal taste', () => {
    const anchor = { lat: 6.4304, lng: 3.4265 }
    const near = mk({ id: 'near', category: 'cafe', affinity: 0.7, lat: 6.4309, lng: 3.427 })
    const far = mk({ id: 'far', category: 'cafe', affinity: 0.7, lat: 6.6, lng: 3.6 })
    const c = ctx({ anchor })
    expect(scoreCandidate(near, 'open', c)).toBeGreaterThan(scoreCandidate(far, 'open', c))
  })

  it('does not punish a candidate when there is no anchor yet', () => {
    const far = mk({ id: 'far', category: 'cafe', affinity: 0.7, lat: 6.6, lng: 3.6 })
    const near = mk({ id: 'near', category: 'cafe', affinity: 0.7, lat: 6.4309, lng: 3.427 })
    expect(scoreCandidate(far, 'open', ctx())).toBe(scoreCandidate(near, 'open', ctx()))
  })

  it('builds a route whose legs are walkable when near options exist', () => {
    const r = buildRoute({
      candidates: FIXTURE_CANDIDATES,
      request: { city: 'Lagos', mood: 'anything', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
    })
    if ('error' in r) throw new Error('expected a route')
    for (const s of r.stops) {
      if (s.walkFromPrev) expect(s.walkFromPrev.minutes).toBeLessThan(60)
    }
  })
})

describe('reasons read like English', () => {
  it('does not prefix a long ambience paragraph with "Good for"', () => {
    const wordy = mk({
      id: 'wordy',
      category: 'restaurant',
      affinity: null,
      popularity: null,
      descriptors: {
        ambience:
          'The atmosphere is characterized by a sleek, modern efficiency that creates a restful and professional environment. It feels like a private, well-maintained retreat from the city outside.',
      },
    })
    const { why } = buildWhy(wordy, {
      requestedTagIds: [],
      locality: 'Lagos',
      explainability: null,
      seedNames: {},
    })
    expect(why).not.toContain('Good for The atmosphere')
    expect(why.length).toBeLessThan(140)
  })

  it('renders a good_for phrase as something a person would say', () => {
    const bar = mk({
      id: 'b',
      category: 'cocktail_bar',
      affinity: null,
      popularity: null,
      descriptors: { goodFor: 'Large Group, Anniversary' },
    })
    const { why } = buildWhy(bar, {
      requestedTagIds: [],
      locality: 'Lagos',
      explainability: null,
      seedNames: {},
    })
    expect(why).toContain('Good for large group')
  })
})

describe('descriptions are prose, not labels', () => {
  const whyFor = (descriptors: Candidate['descriptors']) =>
    buildWhy(mk({ id: 'd', category: 'restaurant', affinity: null, popularity: null, descriptors }), {
      requestedTagIds: [],
      locality: 'Lagos',
      explainability: null,
      seedNames: {},
    }).why

  it('quotes a long cuisine description instead of saying "Serves <paragraph>"', () => {
    const why = whyFor({
      cuisine:
        'Bambooka specializes in traditional Nigerian grilled seafood and classic soups. The menu is celebrated for its standout grilled catfish, croaker, and pork ribs.',
    })
    expect(why).not.toMatch(/Serves Bambooka specializes/)
    expect(why.length).toBeLessThan(140)
  })

  it('still uses a short cuisine name as a label', () => {
    expect(whyFor({ cuisine: 'West African' })).toContain('Serves West African')
  })

  it('does not repeat "good for" when the tag name already contains it', () => {
    expect(whyFor({ goodFor: 'Good For Kids' })).toBe('Good for kids.')
  })

  it('does not repeat itself across several good_for tags', () => {
    const why = whyFor({ goodFor: 'Good For Kids, Good For Groups' })
    expect(why).toBe('Good for kids, groups.')
  })
})

describe('a route never asks for an unreasonable walk', () => {
  it('drops a candidate kilometres from the anchor in favour of a nearer one', () => {
    const anchorRestaurant = mk({
      id: 'r',
      name: 'Anchor Kitchen',
      category: 'restaurant',
      affinity: 0.76,
      lat: 6.43,
      lng: 3.42,
    })
    const nearBar = mk({
      id: 'near-bar',
      name: 'Near Bar',
      category: 'cocktail_bar',
      affinity: 0.76,
      lat: 6.432,
      lng: 3.422,
    })
    const farBar = mk({
      id: 'far-bar',
      name: 'Far Bar',
      category: 'lounge',
      affinity: 0.76,
      lat: 6.65,
      lng: 3.75,
    })
    const nearCafe = mk({
      id: 'near-cafe',
      name: 'Near Cafe',
      category: 'cafe',
      affinity: 0.76,
      lat: 6.429,
      lng: 3.419,
    })

    const r = buildRoute({
      candidates: [anchorRestaurant, farBar, nearBar, nearCafe],
      request: { city: 'Lagos', mood: 'any', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'qloo',
    })
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.map((s) => s.candidate.id)).toContain('near-bar')
    expect(r.stops.map((s) => s.candidate.id)).not.toContain('far-bar')
  })

  it('still fills a slot from far away when nothing near exists', () => {
    const anchorRestaurant = mk({
      id: 'r',
      category: 'restaurant',
      affinity: 0.8,
      lat: 6.43,
      lng: 3.42,
    })
    const farBar = mk({ id: 'far-bar', category: 'lounge', affinity: 0.8, lat: 6.65, lng: 3.75 })
    const nearCafe = mk({ id: 'near-cafe', category: 'cafe', affinity: 0.8, lat: 6.429, lng: 3.419 })

    const r = buildRoute({
      candidates: [anchorRestaurant, farBar, nearCafe],
      request: { city: 'Lagos', mood: 'any', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'qloo',
    })
    if ('error' in r) throw new Error('expected a route, not a refusal')
    expect(r.stops.map((s) => s.candidate.id)).toContain('far-bar')
  })
})

describe('reasons prefer the distinctive over the generic', () => {
  const whyFor = (descriptors: Candidate['descriptors']) =>
    buildWhy(mk({ id: 'g', category: 'restaurant', affinity: null, popularity: null, descriptors }), {
      requestedTagIds: [],
      locality: 'Lagos',
      explainability: null,
      seedNames: {},
    }).why

  it('prefers an ambience quote over a generic good_for tag', () => {
    const why = whyFor({
      goodFor: 'Good For Kids',
      ambience: 'A narrow courtyard strung with lights, loud by ten.',
    })
    expect(why).toContain('narrow courtyard')
    expect(why).not.toContain('Good for kids')
  })

  it('still uses a generic good_for tag when there is nothing better', () => {
    expect(whyFor({ goodFor: 'Good For Kids' })).toBe('Good for kids.')
  })

  it('keeps a distinctive good_for tag ahead of an ambience quote', () => {
    const why = whyFor({
      goodFor: 'Live Music, Anniversary',
      ambience: 'A narrow courtyard strung with lights.',
    })
    expect(why).toContain('Good for live music, anniversary')
  })
})

describe('the anchor is chosen for the route, not for itself', () => {
  it('prefers a slightly worse restaurant that has walkable neighbours', () => {
    // Observed live: the best-scoring restaurant sat in a far suburb, so every
    // other stop was hours away. A marginally worse anchor with a cluster
    // around it makes a better evening.
    const remoteStar = mk({
      id: 'remote-star',
      name: 'Remote Star',
      category: 'restaurant',
      affinity: 0.9,
      lat: 6.62,
      lng: 3.51,
    })
    const clusterRestaurant = mk({
      id: 'cluster-restaurant',
      name: 'Cluster Kitchen',
      category: 'restaurant',
      affinity: 0.82,
      lat: 6.43,
      lng: 3.42,
    })
    const clusterCafe = mk({
      id: 'cluster-cafe',
      name: 'Cluster Cafe',
      category: 'cafe',
      affinity: 0.8,
      lat: 6.431,
      lng: 3.421,
    })
    const clusterBar = mk({
      id: 'cluster-bar',
      name: 'Cluster Bar',
      category: 'cocktail_bar',
      affinity: 0.8,
      lat: 6.4295,
      lng: 3.4185,
    })

    const r = buildRoute({
      candidates: [remoteStar, clusterRestaurant, clusterCafe, clusterBar],
      request: { city: 'Lagos', mood: 'any', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'qloo',
    })
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.map((s) => s.candidate.id)).toContain('cluster-restaurant')
    expect(r.stops.map((s) => s.candidate.id)).not.toContain('remote-star')
    for (const s of r.stops) {
      if (s.walkFromPrev) expect(s.walkFromPrev.minutes).toBeLessThan(30)
    }
  })

  it('still uses the only restaurant available even when it is remote', () => {
    const remoteOnly = mk({
      id: 'remote-only',
      category: 'restaurant',
      affinity: 0.9,
      lat: 6.62,
      lng: 3.51,
    })
    const cafe = mk({ id: 'c', category: 'cafe', affinity: 0.8, lat: 6.43, lng: 3.42 })
    const bar = mk({ id: 'b', category: 'cocktail_bar', affinity: 0.8, lat: 6.431, lng: 3.421 })

    const r = buildRoute({
      candidates: [remoteOnly, cafe, bar],
      request: { city: 'Lagos', mood: 'any', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'qloo',
    })
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.map((s) => s.candidate.id)).toContain('remote-only')
  })

  it('remains deterministic with several anchor options', () => {
    const cands = [
      mk({ id: 'r1', category: 'restaurant', affinity: 0.8, lat: 6.43, lng: 3.42 }),
      mk({ id: 'r2', category: 'restaurant', affinity: 0.8, lat: 6.44, lng: 3.43 }),
      mk({ id: 'c1', category: 'cafe', affinity: 0.8, lat: 6.431, lng: 3.421 }),
      mk({ id: 'b1', category: 'cocktail_bar', affinity: 0.8, lat: 6.4295, lng: 3.4185 }),
    ]
    const input: BuildInput = {
      candidates: cands,
      request: { city: 'Lagos', mood: 'any', timeWindow: { startHour: 18, endHour: 23 } },
      locality: { name: 'Lagos' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'qloo',
    }
    const a = buildRoute(input)
    const b = buildRoute(input)
    if ('error' in a || 'error' in b) throw new Error('expected routes')
    expect(a.stops.map((s) => s.candidate.id)).toEqual(b.stops.map((s) => s.candidate.id))
  })
})
