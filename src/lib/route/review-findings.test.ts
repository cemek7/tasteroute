import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { slotsFor } from './slots'
import { scoreCandidate, type ScoreContext } from './score'
import { buildRoute, type BuildInput } from './build'
import type { Candidate } from '../providers/types'

// primaryGenre defaults to null so these cases exercise the category and tag
// paths. A test that wants Qloo's own classification sets it explicitly.
const mk = (over: Partial<Candidate>): Candidate => ({
  ...FIXTURE_CANDIDATES[0],
  primaryGenre: null,
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

const input = (candidates: Candidate[]): BuildInput => ({
  candidates,
  request: { city: 'Abuja', mood: 'any', timeWindow: { startHour: 18, endHour: 23 }, intent: {} },
  locality: { name: 'Abuja' },
  requestedTagIds: [],
  explainability: null,
  seedNames: {},
  trace: [],
  providerKind: 'qloo',
})

describe('a substring must not decide a venue kind', () => {
  it('keeps a barbecue restaurant in the dinner slot, not the nightcap slot', () => {
    expect(slotsFor(mk({ id: 'bbq', category: 'barbecue' }))).toEqual(['main'])
    expect(slotsFor(mk({ id: 'bbq2', category: 'barbeque' }))).toEqual(['main'])
  })

  it('reads a nested barbecue genre urn as a restaurant', () => {
    const bbq = mk({
      id: 'bbq3',
      category: null,
      tags: [
        {
          id: 'urn:tag:genre:place:restaurant:barbecue',
          name: 'Barbecue',
          type: 'urn:tag:genre:place',
          popularity: 1,
        },
      ],
    })
    expect(slotsFor(bbq)).toEqual(['main'])
  })

  it('does not treat a country club or golf club as a nightcap', () => {
    for (const category of ['country_club', 'golf_club', 'health_club']) {
      expect(slotsFor(mk({ id: category, category }))).toEqual([])
    }
  })

  it('still puts a real bar in the nightcap slot', () => {
    expect(slotsFor(mk({ id: 'bar', category: 'bar' }))).toEqual(['close'])
    expect(slotsFor(mk({ id: 'cb', category: 'cocktail_bar' }))).toEqual(['close'])
    expect(slotsFor(mk({ id: 'wb', category: 'wine_bar' }))).toEqual(['close'])
  })

  it('still puts a nightclub and a supper club where they belong', () => {
    expect(slotsFor(mk({ id: 'nc', category: 'nightclub' }))).toEqual(['close'])
  })
})

describe('the unfillable-slot message names only the real gaps', () => {
  it('names just the missing slot when the other two are fillable', () => {
    // A barbecue joint is the only restaurant; there is a cafe and a bar too.
    const r = buildRoute(
      input([
        mk({ id: 'bbq', category: 'barbecue', affinity: 0.8, lat: 9.06, lng: 7.49 }),
        mk({ id: 'cafe', category: 'cafe', affinity: 0.8, lat: 9.061, lng: 7.491 }),
        mk({ id: 'bar', category: 'cocktail_bar', affinity: 0.8, lat: 9.062, lng: 7.492 }),
      ]),
    )
    // With barbecue correctly in main, this is a complete route.
    if ('error' in r) throw new Error(`expected a route, got: ${r.reason}`)
    expect(r.stops).toHaveLength(3)
  })

  it('names only the open slot when no cafe-like venue exists', () => {
    const r = buildRoute(
      input([
        mk({ id: 'rest', category: 'restaurant', affinity: 0.8, lat: 9.06, lng: 7.49 }),
        mk({ id: 'bar', category: 'cocktail_bar', affinity: 0.8, lat: 9.061, lng: 7.491 }),
      ]),
    )
    expect('error' in r).toBe(true)
    if (!('error' in r)) return
    expect(r.unfilledSlots).toEqual(['open'])
    expect(r.reason).not.toContain('main')
    expect(r.reason).not.toContain('close')
  })

  it('names only main when there is no main-eligible venue at all', () => {
    const r = buildRoute(
      input([
        mk({ id: 'cafe', category: 'cafe', affinity: 0.8, lat: 9.06, lng: 7.49 }),
        mk({ id: 'bar', category: 'cocktail_bar', affinity: 0.8, lat: 9.061, lng: 7.491 }),
      ]),
    )
    expect('error' in r).toBe(true)
    if (!('error' in r)) return
    expect(r.unfilledSlots).toEqual(['main'])
    expect(r.reason).not.toContain('open')
    expect(r.reason).not.toContain('close')
  })
})

describe('missing coordinates are not an advantage', () => {
  it('ranks a candidate with no coordinates below an equally matched nearby one', () => {
    const anchor = { lat: 9.06, lng: 7.49 }
    const near = mk({ id: 'near', category: 'cafe', affinity: 0.5, lat: 9.0605, lng: 7.4905 })
    const nowhere = mk({ id: 'nowhere', category: 'cafe', affinity: 0.5, lat: null, lng: null })
    const c = ctx({ anchor })
    expect(scoreCandidate(near, 'open', c)).toBeGreaterThan(scoreCandidate(nowhere, 'open', c))
  })

  it('ranks a candidate with no coordinates below one a kilometre and a half away', () => {
    const anchor = { lat: 9.06, lng: 7.49 }
    const away = mk({ id: 'away', category: 'cafe', affinity: 0.5, lat: 9.0735, lng: 7.49 })
    const nowhere = mk({ id: 'nowhere', category: 'cafe', affinity: 0.5, lat: null, lng: null })
    const c = ctx({ anchor })
    expect(scoreCandidate(away, 'open', c)).toBeGreaterThan(scoreCandidate(nowhere, 'open', c))
  })

  it('prefers an anchor that has coordinates, so the route reports its walks', () => {
    const r = buildRoute(
      input([
        mk({ id: 'rest-nowhere', category: 'restaurant', affinity: 0.8, lat: null, lng: null }),
        mk({ id: 'rest-located', category: 'restaurant', affinity: 0.8, lat: 9.06, lng: 7.49 }),
        mk({ id: 'cafe', category: 'cafe', affinity: 0.8, lat: 9.0605, lng: 7.4905 }),
        mk({ id: 'bar', category: 'cocktail_bar', affinity: 0.8, lat: 9.0608, lng: 7.4908 }),
      ]),
    )
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.map((s) => s.candidate.id)).toContain('rest-located')
    expect(r.stops.map((s) => s.candidate.id)).not.toContain('rest-nowhere')
    expect(r.stops.filter((s) => s.walkFromPrev).length).toBe(2)
  })

  it('does not count an unknown leg as a zero-length walk when comparing routes', () => {
    // The located cluster is tight; the coordinate-less option must not win by
    // having its legs priced at nothing.
    const r = buildRoute(
      input([
        mk({ id: 'rest-nowhere', category: 'restaurant', affinity: 0.85, lat: null, lng: null }),
        mk({ id: 'rest-located', category: 'restaurant', affinity: 0.8, lat: 9.06, lng: 7.49 }),
        mk({ id: 'cafe', category: 'cafe', affinity: 0.8, lat: 9.0605, lng: 7.4905 }),
        mk({ id: 'bar', category: 'cocktail_bar', affinity: 0.8, lat: 9.0608, lng: 7.4908 }),
      ]),
    )
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.every((s) => s.candidate.lat !== null)).toBe(true)
  })
})
