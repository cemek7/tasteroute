import { describe, expect, it } from 'vitest'
import { qlooInsightsSchema, qlooTagsSchema } from './schemas'

const minimalInsights = {
  success: true,
  results: {
    entities: [
      {
        entity_id: 'D1794390-0F7B-4DF8-8149-E4506D373BAD',
        name: 'NOK by Alara',
        type: 'urn:entity:place',
        properties: { address: '12A Akin Olugbade St' },
        tags: [],
      },
    ],
  },
}

describe('qlooInsightsSchema', () => {
  it('accepts a response with only the fields Qloo always returns', () => {
    const parsed = qlooInsightsSchema.parse(minimalInsights)
    expect(parsed.results.entities[0].name).toBe('NOK by Alara')
  })

  it('accepts a missing entities array as empty', () => {
    const parsed = qlooInsightsSchema.parse({ success: true, results: {} })
    expect(parsed.results.entities).toEqual([])
  })

  it('surfaces warnings when Qloo could not compute explainability', () => {
    const parsed = qlooInsightsSchema.parse({
      ...minimalInsights,
      warnings: [{ type: 'Could not calculate explainability' }],
    })
    expect(parsed.warnings?.[0].type).toContain('explainability')
  })

  it('rejects a payload missing entity_id, which we key on', () => {
    const bad = { success: true, results: { entities: [{ name: 'No id' }] } }
    expect(qlooInsightsSchema.safeParse(bad).success).toBe(false)
  })
})

describe('qlooTagsSchema', () => {
  it('parses a tag with its urn and popularity', () => {
    const parsed = qlooTagsSchema.parse({
      success: true,
      results: {
        tags: [
          {
            id: 'urn:tag:genre:place:restaurant:cocktail_bar',
            name: 'Cocktail Bar',
            type: 'urn:tag:genre:place',
            popularity: 0.99964285,
          },
        ],
      },
    })
    expect(parsed.results.tags[0].id).toContain('cocktail_bar')
  })
})
