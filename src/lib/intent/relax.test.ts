import { describe, expect, it } from 'vitest'
import { cityCentre, relaxOnce, relaxOrder } from './relax'
import { FixtureProvider } from '../providers/fixture'

describe('relaxation order', () => {
  it('gives up the softest constraint first and a stated need last', () => {
    const order = relaxOrder({
      popularityMax: 0.5,
      priceLevelMax: 2,
      radius: { lat: 9, lng: 7, metres: 1000 },
      requiredTags: ['urn:tag:dietary_option:qloo:halal'],
    })
    expect(order).toEqual(['radius', 'popularityMax', 'priceLevelMax', 'requiredTags'])
  })

  it('never offers to drop an exclusion the person asked for', () => {
    expect(relaxOrder({ excludeTags: ['urn:tag:x'] })).toEqual([])
  })

  it('never offers to drop demographics, which are a signal not a filter', () => {
    expect(relaxOrder({ demographics: { ageBand: '25_to_29' } })).toEqual([])
  })
})

describe('relaxOnce', () => {
  it('drops one constraint and names it', () => {
    const r = relaxOnce({ popularityMax: 0.5, priceLevelMax: 2 })
    expect(r?.dropped).toBe('popularityMax')
    expect(r?.next.popularityMax).toBeUndefined()
    expect(r?.next.priceLevelMax).toBe(2)
  })

  it('returns null when there is nothing left to give up', () => {
    expect(relaxOnce({})).toBeNull()
    expect(relaxOnce({ excludeTags: ['urn:tag:x'] })).toBeNull()
  })
})

describe('cityCentre', () => {
  it('takes the coordinates of the first located result', async () => {
    const centre = await cityCentre(new FixtureProvider(), 'Lagos')
    expect(centre?.lat).toBeCloseTo(6.4281, 3)
  })

  it('returns null when nothing has coordinates', async () => {
    const blind = {
      kind: 'qloo' as const,
      async findTags() {
        return []
      },
      async seedEntities() {
        return []
      },
      async suggestPlaces() {
        return { candidates: [], explainability: null, warnings: [] }
      },
    }
    expect(await cityCentre(blind, 'Nowhere')).toBeNull()
  })
})
