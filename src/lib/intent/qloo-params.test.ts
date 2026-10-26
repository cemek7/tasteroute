import { describe, expect, it } from 'vitest'
import { constraintsFromIntent, effectiveDiscovery } from './qloo-params'

describe('discovery maps to a popularity band', () => {
  it('leans to the famous end below a third', () => {
    const { constraints } = constraintsFromIntent({ discovery: 0.1 })
    expect(constraints.popularityMin).toBe(0.8)
    expect(constraints.popularityMax).toBeUndefined()
  })

  it('applies no popularity filter in the middle', () => {
    const { constraints } = constraintsFromIntent({ discovery: 0.5 })
    expect(constraints.popularityMin).toBeUndefined()
    expect(constraints.popularityMax).toBeUndefined()
  })

  it('leans to hidden gems above two thirds', () => {
    const { constraints } = constraintsFromIntent({ discovery: 0.9 })
    expect(constraints.popularityMax).toBe(0.5)
    expect(constraints.popularityMin).toBeUndefined()
  })

  it('applies nothing when discovery was not set', () => {
    expect(constraintsFromIntent({})).toEqual({ constraints: {}, applied: [] })
  })

  it('defaults a newcomer towards hidden gems', () => {
    const { constraints } = constraintsFromIntent({ persona: 'newcomer' })
    expect(constraints.popularityMax).toBe(0.5)
  })

  it('lets an explicit discovery value beat the persona default', () => {
    const { constraints } = constraintsFromIntent({ persona: 'newcomer', discovery: 0.1 })
    expect(constraints.popularityMin).toBe(0.8)
    expect(constraints.popularityMax).toBeUndefined()
  })

  it('says what it applied, in words a person can read', () => {
    const { applied } = constraintsFromIntent({ discovery: 0.9 })
    expect(applied).toEqual([
      { label: 'Hidden gems', detail: 'only places Qloo rates below 0.5 for popularity' },
    ])
  })
})

describe('budget and area become hard constraints', () => {
  it('turns a budget into a price ceiling', () => {
    const { constraints, applied } = constraintsFromIntent({ budget: 2 })
    expect(constraints.priceLevelMax).toBe(2)
    expect(applied[0].label).toBe('Budget')
  })

  it('does not set a ceiling for the top budget tier', () => {
    expect(constraintsFromIntent({ budget: 4 }).constraints.priceLevelMax).toBeUndefined()
  })

  it('records a requested radius without a centre, for the caller to resolve', () => {
    const { constraints } = constraintsFromIntent({ area: { radiusMetres: 3000 } })
    expect(constraints.radius).toEqual({ lat: 0, lng: 0, metres: 3000 })
  })

  it('treats a null area as the whole city', () => {
    expect(constraintsFromIntent({ area: null }).constraints.radius).toBeUndefined()
  })
})

describe('effectiveDiscovery is what the search will actually use', () => {
  it('returns the persona default, so the slider can show it', () => {
    expect(effectiveDiscovery({ persona: 'newcomer' })).toBe(0.75)
    expect(effectiveDiscovery({ persona: 'visiting' })).toBe(0.6)
    expect(effectiveDiscovery({ persona: 'local' })).toBe(0.4)
  })

  it('prefers an explicit value over the persona default', () => {
    expect(effectiveDiscovery({ persona: 'newcomer', discovery: 0.1 })).toBe(0.1)
  })

  it('is undefined when nothing implies a value', () => {
    expect(effectiveDiscovery({})).toBeUndefined()
  })

  it('agrees with the constraint the same intent produces', () => {
    const intent = { persona: 'newcomer' } as const
    expect(effectiveDiscovery(intent)).toBeGreaterThan(2 / 3)
    expect(constraintsFromIntent(intent).constraints.popularityMax).toBe(0.5)
  })

  it("shows a local's 0.4 honestly: it is inside the band that filters nothing", () => {
    const intent = { persona: 'local' } as const
    expect(effectiveDiscovery(intent)).toBe(0.4)
    const { constraints } = constraintsFromIntent(intent)
    expect(constraints.popularityMin).toBeUndefined()
    expect(constraints.popularityMax).toBeUndefined()
  })
})
