import { describe, expect, it } from 'vitest'
import { QlooProvider, UnknownLocalityError } from './qloo'
import { ACCESSIBILITY_TAGS, DIETARY_TAGS } from '../intent/vocabulary'

const hasKey = Boolean(process.env.QLOO_API_KEY)

describe.skipIf(!hasKey)('QlooProvider against the live hackathon host', () => {
  it('returns places for Lagos', async () => {
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Lagos',
      take: 10,
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].name).toBeTruthy()
  }, 45_000)

  it('returns real tag urns for a mood word', async () => {
    const tags = await new QlooProvider().findTags('cocktail')
    expect(tags.some((t) => t.id.includes('cocktail'))).toBe(true)
  }, 45_000)

  it('rejects a city Qloo does not know with a readable message', async () => {
    await expect(
      new QlooProvider().suggestPlaces({ locality: 'Zzzznotacity Qqq' }),
    ).rejects.toThrow(/no locality matching/)
  }, 45_000)

  it('parses a full untagged page of 50 Lagos places', async () => {
    // The agent's fallback search runs untagged at a larger page size than the
    // smoke test above, which is where unseen field shapes turn up.
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Lagos',
      take: 50,
    })
    expect(candidates.length).toBeGreaterThan(20)
  }, 45_000)

  it('parses a tagged search at the default agent page size', async () => {
    const tags = await new QlooProvider().findTags('cocktail')
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Lagos',
      tags: tags.slice(0, 3).map((t) => ({ id: t.id })),
      take: 30,
    })
    expect(Array.isArray(candidates)).toBe(true)
  }, 45_000)
})

/**
 * The paths the richer-intent work added. Each one pins a claim about Qloo
 * that no amount of local mocking can check, because a mock returns whatever
 * we assumed. The first test here is the one that matters most: `filter.tags`
 * defaults to a UNION, and for two weeks the app told people a halal
 * requirement and a wheelchair requirement had both been applied while
 * returning places that met neither.
 */
describe.skipIf(!hasKey)('the constraint paths, against the live host', () => {
  const halal = DIETARY_TAGS.halal
  const entrance = ACCESSIBILITY_TAGS.wheelchair_entrance

  it('intersects two required tags rather than unioning them', async () => {
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Abuja',
      take: 30,
      constraints: { requiredTags: [halal, entrance] },
    })
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      const ids = c.tags.map((t) => t.id)
      expect(ids).toContain(halal)
      expect(ids).toContain(entrance)
    }
  }, 45_000)

  it('returns strictly fewer places for two requirements than for one', async () => {
    const one = await new QlooProvider().suggestPlaces({
      locality: 'Abuja',
      take: 50,
      constraints: { requiredTags: [halal] },
    })
    const two = await new QlooProvider().suggestPlaces({
      locality: 'Abuja',
      take: 50,
      constraints: { requiredTags: [halal, entrance] },
    })
    expect(two.candidates.length).toBeLessThanOrEqual(one.candidates.length)
  }, 60_000)

  it('centres the search on a given point rather than the city', async () => {
    // Wuse II, Abuja. A 1.5km radius should not reach the far side of the city.
    const centre = { lat: 9.0765, lng: 7.4631 }
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Abuja',
      take: 20,
      constraints: { radius: { ...centre, metres: 1500 } },
    })
    expect(candidates.length).toBeGreaterThan(0)
    const located = candidates.filter((c) => c.lat != null && c.lng != null)
    expect(located.length).toBeGreaterThan(0)
    for (const c of located) {
      const dLat = (c.lat! - centre.lat) * 111_000
      const dLng = (c.lng! - centre.lng) * 111_000 * Math.cos((centre.lat * Math.PI) / 180)
      // Qloo's own radius, plus slack for its centroid rounding.
      expect(Math.hypot(dLat, dLng)).toBeLessThan(3_000)
    }
  }, 45_000)

  it('resolves a named place to an entity id through /search', async () => {
    // The /search response is a different entity shape from /v2/insights, and
    // validating it against the insights schema made this silently return
    // nothing for two weeks.
    const refs = await new QlooProvider().seedEntities(['Nkoyo'])
    expect(refs.length).toBeGreaterThan(0)
    expect(refs[0].entityId).toMatch(/^[0-9A-F-]{8,}$/i)
  }, 45_000)

  it('explains its answer when the search is seeded with an entity', async () => {
    const refs = await new QlooProvider().seedEntities(['Nkoyo'])
    expect(refs.length).toBeGreaterThan(0)
    const { explainability } = await new QlooProvider().suggestPlaces({
      locality: 'Abuja',
      take: 20,
      entities: refs.map((r) => r.entityId),
    })
    expect(explainability).not.toBeNull()
    const ids = explainability!.signalEntities.map((e) => e.entityId)
    expect(ids).toContain(refs[0].entityId)
    // Qloo reports the same seed across four tiers and we keep the widest.
    expect(explainability!.signalEntities[0].topN).toBeDefined()
    // `appliesTo` is deliberately empty here: only the session still holds the
    // candidate list this block was computed against, so it fills it in.
    expect(explainability!.signalEntities[0].appliesTo).toEqual([])
  }, 60_000)

  it('publishes a price level on some places and none on most', async () => {
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Abuja',
      take: 50,
    })
    const priced = candidates.filter((c) => typeof c.priceLevel === 'number')
    // Measured at roughly 1 in 5. The claim being pinned is that the field
    // arrives at all, and that most places lack it — which is why budget
    // cannot be a plain hard filter.
    expect(priced.length).toBeGreaterThan(0)
    expect(priced.length).toBeLessThan(candidates.length)
    for (const c of priced) expect(c.priceLevel!).toBeGreaterThanOrEqual(1)
  }, 45_000)

  it('does not blame the city when Qloo rejects a parameter', async () => {
    // A popularity floor above 1 is impossible, so Qloo answers 400 with a
    // message naming the parameter. Reporting that as "unknown city" sent
    // people away from a city that exists.
    const err = await new QlooProvider()
      .suggestPlaces({
        locality: 'Abuja',
        constraints: { popularityMin: 9 },
      })
      .then(() => null)
      .catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(UnknownLocalityError)
    expect(err!.message).toMatch(/popularity/i)
  }, 45_000)
})
