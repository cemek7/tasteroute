import { describe, expect, it } from 'vitest'
import { FixtureProvider } from './fixture'

describe('FixtureProvider', () => {
  const p = new FixtureProvider()

  it('declares itself as a fixture so the UI can disclose it', () => {
    expect(p.kind).toBe('fixture')
  })

  it('finds tags by substring, case-insensitively', async () => {
    const tags = await p.findTags('COCKTAIL')
    expect(tags.length).toBeGreaterThan(0)
    expect(tags[0].id).toContain('cocktail')
  })

  it('returns an empty array for a query matching nothing', async () => {
    expect(await p.findTags('zzzznope')).toEqual([])
  })

  it('returns candidates covering all three slots', async () => {
    const { candidates } = await p.suggestPlaces({ locality: 'Lagos' })
    expect(candidates.length).toBeGreaterThanOrEqual(9)
    expect(candidates.every((c) => c.providerRef.provider === 'fixture')).toBe(true)
  })

  it('assigns sequential providerRank starting at 1', async () => {
    const { candidates } = await p.suggestPlaces({ locality: 'Lagos' })
    expect(candidates.map((c) => c.providerRank).slice(0, 3)).toEqual([1, 2, 3])
  })

  it('filters candidates by requested tags when tags are given', async () => {
    const { candidates } = await p.suggestPlaces({
      locality: 'Lagos',
      tags: [{ id: 'urn:tag:genre:place:restaurant:cocktail_bar' }],
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(
      candidates.every((c) =>
        c.tags.some((t) => t.id === 'urn:tag:genre:place:restaurant:cocktail_bar'),
      ),
    ).toBe(true)
  })

  it('returns null explainability unless entities were seeded', async () => {
    const withTags = await p.suggestPlaces({ locality: 'Lagos' })
    expect(withTags.explainability).toBeNull()

    const seeded = await p.suggestPlaces({ locality: 'Lagos', entities: ['fx-nok'] })
    expect(seeded.explainability?.signalEntities[0].entityId).toBe('fx-nok')
  })

  it('offers three venues that are open in each slot, so assessSignal can grade strong', async () => {
    const { candidates } = await p.suggestPlaces({ locality: 'Lagos' })
    const openRestaurants = candidates.filter(
      (c) => c.category === 'restaurant' && c.isClosed !== true,
    )
    expect(openRestaurants.length).toBeGreaterThanOrEqual(3)
  })
})
