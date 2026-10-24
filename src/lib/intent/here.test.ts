import { describe, expect, it } from 'vitest'
import { coordsSchema, labelForHere } from './here'

describe('coordsSchema', () => {
  it('accepts a real position', () => {
    expect(coordsSchema.safeParse({ lat: 9.0579, lng: 7.4913 }).success).toBe(true)
  })

  it('rejects coordinates off the globe', () => {
    expect(coordsSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false)
    expect(coordsSchema.safeParse({ lat: 0, lng: 181 }).success).toBe(false)
  })

  it('rejects the null island, which is almost always a bug not a place', () => {
    expect(coordsSchema.safeParse({ lat: 0, lng: 0 }).success).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(coordsSchema.safeParse({ lat: '9.05', lng: '7.49' }).success).toBe(false)
  })
})

describe('labelForHere', () => {
  it('describes a radius around the person', () => {
    expect(labelForHere(2000)).toBe('within 2.0km of where you are')
  })

  it('rounds to one decimal', () => {
    expect(labelForHere(1500)).toBe('within 1.5km of where you are')
  })
})

describe('a supplied position is used instead of a guessed city centre', () => {
  it('becomes the radius centre, with no lookup needed', async () => {
    const { constraintsFromIntent } = await import('./qloo-params')
    const { constraints, applied } = constraintsFromIntent({
      area: { radiusMetres: 2000 },
      here: { lat: 9.0579, lng: 7.4913 },
    })
    expect(constraints.radius).toEqual({ lat: 9.0579, lng: 7.4913, metres: 2000 })
    expect(applied.some((a) => a.detail.includes('where you are'))).toBe(true)
  })

  it('still leaves the centre for the caller to resolve when no position was given', async () => {
    const { constraintsFromIntent } = await import('./qloo-params')
    const { constraints } = constraintsFromIntent({ area: { radiusMetres: 2000 } })
    expect(constraints.radius).toEqual({ lat: 0, lng: 0, metres: 2000 })
  })

  it('ignores a position when no radius was asked for', async () => {
    const { constraintsFromIntent } = await import('./qloo-params')
    const { constraints } = constraintsFromIntent({ here: { lat: 9.05, lng: 7.49 } })
    expect(constraints.radius).toBeUndefined()
  })
})
