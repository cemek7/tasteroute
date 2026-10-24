import { describe, expect, it } from 'vitest'
import { constraintsFromIntent } from './qloo-params'

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
