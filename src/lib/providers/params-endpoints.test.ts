import { describe, expect, it } from 'vitest'
import { buildSearchParams, buildTagsParams } from './params'

describe('buildTagsParams', () => {
  it('passes through allowed parameters', () => {
    const p = buildTagsParams({ 'filter.query': 'cocktail', take: 6 })
    expect(p.get('filter.query')).toBe('cocktail')
    expect(p.get('take')).toBe('6')
  })

  it('throws on a typo, because Qloo would silently ignore it', () => {
    expect(() => buildTagsParams({ 'filter.quey': 'cocktail' })).toThrow(
      /not an allowed Qloo tags parameter/,
    )
  })
})

describe('buildSearchParams', () => {
  it('passes through allowed parameters', () => {
    const p = buildSearchParams({ query: 'NOK by Alara', take: 1 })
    expect(p.get('query')).toBe('NOK by Alara')
  })

  it('throws on a typo, because Qloo would silently ignore it', () => {
    expect(() => buildSearchParams({ q: 'NOK' })).toThrow(
      /not an allowed Qloo search parameter/,
    )
  })
})
