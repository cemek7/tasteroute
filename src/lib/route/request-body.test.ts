import { describe, expect, it } from 'vitest'
import { parseRouteBody } from './request-body'

describe('parseRouteBody', () => {
  const good = { city: 'Abuja', mood: 'cocktails', startHour: 18, endHour: 23 }

  it('accepts an ordinary evening', () => {
    const r = parseRouteBody(good)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.timeWindow).toEqual({ startHour: 18, endHour: 23 })
  })

  it('accepts an evening that crosses midnight', () => {
    const r = parseRouteBody({ ...good, startHour: 22, endHour: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.timeWindow).toEqual({ startHour: 22, endHour: 26 })
  })

  it('accepts midnight written as 24', () => {
    const r = parseRouteBody({ ...good, startHour: 20, endHour: 24 })
    expect(r.ok).toBe(true)
  })

  it('rejects an hour outside the clock with a readable message', () => {
    const r = parseRouteBody({ ...good, startHour: 99 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('Start and end times have to be hours of the day, 0 to 24.')
    expect(r.error).not.toMatch(/expected|Too big|Too small|zod/i)
  })

  it('rejects a fractional hour', () => {
    const r = parseRouteBody({ ...good, startHour: 18.5 })
    expect(r.ok).toBe(false)
  })

  it('rejects a missing mood with a readable message', () => {
    const r = parseRouteBody({ ...good, mood: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('Tell us what kind of evening you want.')
  })

  it('rejects a missing city with a readable message', () => {
    const r = parseRouteBody({ ...good, city: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('Tell us which city you are in.')
  })

  it('never leaks a raw validation dump for any malformed body', () => {
    for (const body of [
      null,
      'nonsense',
      {},
      { city: 1, mood: 2, startHour: 'x', endHour: [] },
      { ...good, startHour: null },
    ]) {
      const r = parseRouteBody(body)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.error).not.toMatch(/expected|invalid_type|Too big|Too small|zod/i)
      expect(r.error).not.toContain('\n')
    }
  })
})

describe('parseRouteBody with intent', () => {
  const good = { city: 'Abuja', mood: 'cocktails', startHour: 18, endHour: 23 }

  it('defaults intent to an empty object when none is sent', () => {
    const r = parseRouteBody(good)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intent).toEqual({})
  })

  it('carries every intent field through', () => {
    const r = parseRouteBody({
      ...good,
      vibe: ['quiet', 'intimate'],
      occasion: 'first_date',
      party: { size: 2, composition: 'couple' },
      persona: 'newcomer',
      demographics: { ageBand: '25_to_29', gender: 'female' },
      discovery: 0.8,
      budget: 2,
      area: { radiusMetres: 3000 },
      requirements: { dietary: ['halal'], accessibility: ['wheelchair_seating'] },
      avoid: ['hookah'],
      seedPlaces: ['Jazzhole'],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intent.vibe).toEqual(['quiet', 'intimate'])
    expect(r.value.intent.requirements?.dietary).toEqual(['halal'])
    expect(r.value.intent.discovery).toBe(0.8)
  })

  it('rejects an unknown vibe rather than passing it to Qloo', () => {
    const r = parseRouteBody({ ...good, vibe: ['vibey'] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('One of those preferences is not one we know.')
  })

  it('rejects an unknown dietary requirement', () => {
    expect(parseRouteBody({ ...good, requirements: { dietary: ['paleo'] } }).ok).toBe(false)
  })

  it('rejects a discovery value outside 0 to 1', () => {
    expect(parseRouteBody({ ...good, discovery: 2 }).ok).toBe(false)
    expect(parseRouteBody({ ...good, discovery: -1 }).ok).toBe(false)
  })

  it('rejects a party size that is not a sensible number of people', () => {
    expect(parseRouteBody({ ...good, party: { size: 0 } }).ok).toBe(false)
    expect(parseRouteBody({ ...good, party: { size: 500 } }).ok).toBe(false)
  })

  it('rejects a radius outside walking-to-driving range', () => {
    expect(parseRouteBody({ ...good, area: { radiusMetres: 10 } }).ok).toBe(false)
    expect(parseRouteBody({ ...good, area: { radiusMetres: 500_000 } }).ok).toBe(false)
  })

  it('accepts a null area as meaning the whole city', () => {
    const r = parseRouteBody({ ...good, area: null })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intent.area).toBeNull()
  })

  it('caps avoid and seedPlaces so a request cannot carry a hundred terms', () => {
    const many = Array.from({ length: 50 }, (_, i) => `x${i}`)
    expect(parseRouteBody({ ...good, avoid: many }).ok).toBe(false)
    expect(parseRouteBody({ ...good, seedPlaces: many }).ok).toBe(false)
  })

  it('caps a clarify answer, so it cannot smuggle a long payload', () => {
    expect(
      parseRouteBody({ ...good, clarified: { question: 'q', answer: 'a'.repeat(200) } }).ok,
    ).toBe(false)
  })

  it('never leaks a raw validation dump for a malformed intent', () => {
    const r = parseRouteBody({ ...good, party: 'two people' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).not.toMatch(/expected|invalid_type|zod/i)
  })
})
