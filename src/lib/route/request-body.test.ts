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
