import { describe, expect, it } from 'vitest'
import { QlooProvider } from './qloo'

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
