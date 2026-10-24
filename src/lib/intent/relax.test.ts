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

describe('requirements are given up one at a time', () => {
  it('drops a single required tag rather than the whole set', () => {
    const r = relaxOnce({
      requiredTags: [
        'urn:tag:dietary_option:qloo:halal',
        'urn:tag:accessibility:place:wheelchair_accessible_entrance',
      ],
    })
    expect(r?.dropped).toBe('requiredTags')
    // The accessibility need goes first, the dietary one is kept longest.
    expect(r?.next.requiredTags).toEqual(['urn:tag:dietary_option:qloo:halal'])
  })

  it('removes the key entirely only once the last tag goes', () => {
    const r = relaxOnce({ requiredTags: ['urn:tag:dietary_option:qloo:halal'] })
    expect(r?.next.requiredTags).toBeUndefined()
  })

  it('keeps giving up one tag per call until none remain', () => {
    let c = {
      requiredTags: ['urn:tag:a', 'urn:tag:b', 'urn:tag:c'],
    } as Parameters<typeof relaxOnce>[0]
    const sizes: (number | undefined)[] = []
    for (let i = 0; i < 4; i++) {
      const r = relaxOnce(c)
      if (!r) break
      c = r.next
      sizes.push(c.requiredTags?.length)
    }
    expect(sizes).toEqual([2, 1, undefined])
  })

  it('names which requirement was given up', () => {
    const r = relaxOnce({
      requiredTags: [
        'urn:tag:dietary_option:qloo:halal',
        'urn:tag:accessibility:place:wheelchair_accessible_entrance',
      ],
    })
    expect(r?.droppedDetail).toContain('wheelchair')
  })
})
