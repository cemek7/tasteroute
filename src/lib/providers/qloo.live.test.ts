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
  }, 20_000)

  it('returns real tag urns for a mood word', async () => {
    const tags = await new QlooProvider().findTags('cocktail')
    expect(tags.some((t) => t.id.includes('cocktail'))).toBe(true)
  }, 20_000)

  it('rejects a city Qloo does not know with a readable message', async () => {
    await expect(
      new QlooProvider().suggestPlaces({ locality: 'Zzzznotacity Qqq' }),
    ).rejects.toThrow(/no locality matching/)
  }, 20_000)
})
