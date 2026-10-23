import { describe, expect, it } from 'vitest'
import { buildInsightsParams } from './params'

describe('buildInsightsParams', () => {
  it('passes through allowed parameters', () => {
    const p = buildInsightsParams({
      'filter.type': 'urn:entity:place',
      'filter.location.query': 'Lagos',
      take: 20,
    })
    expect(p.get('filter.type')).toBe('urn:entity:place')
    expect(p.get('filter.location.query')).toBe('Lagos')
    expect(p.get('take')).toBe('20')
  })

  it('throws on an unknown parameter name, because Qloo would silently ignore it', () => {
    expect(() =>
      buildInsightsParams({ 'filter.locaton.query': 'Lagos' }),
    ).toThrow(/not an allowed Qloo insights parameter/)
  })

  it('omits undefined values rather than sending empty strings', () => {
    const p = buildInsightsParams({ 'filter.type': 'urn:entity:place', take: undefined })
    expect(p.has('take')).toBe(false)
  })

  it('serialises booleans as true/false', () => {
    const p = buildInsightsParams({ 'feature.explainability': true })
    expect(p.get('feature.explainability')).toBe('true')
  })
})
