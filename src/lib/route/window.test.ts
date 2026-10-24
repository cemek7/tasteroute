import { describe, expect, it } from 'vitest'
import { normaliseWindow, type TimeWindow } from './window'

describe('normaliseWindow', () => {
  it('leaves an ordinary evening alone', () => {
    expect(normaliseWindow(18, 23)).toEqual({ startHour: 18, endHour: 23 })
  })

  it('carries an evening that crosses midnight past 24 rather than rejecting it', () => {
    expect(normaliseWindow(22, 2)).toEqual({ startHour: 22, endHour: 26 })
  })

  it('treats equal hours as a full day out, not a zero-length evening', () => {
    expect(normaliseWindow(20, 20)).toEqual({ startHour: 20, endHour: 44 })
  })

  it('handles the small hours', () => {
    expect(normaliseWindow(23, 1)).toEqual({ startHour: 23, endHour: 25 })
  })

  it('accepts midnight written as 24', () => {
    expect(normaliseWindow(18, 24)).toEqual({ startHour: 18, endHour: 24 })
  })
})

describe('a wrapped window does not penalise every venue', () => {
  it('counts a venue open 20:00 to 02:00 as open during a 22:00 to 02:00 night', async () => {
    const { scoreCandidate } = await import('./score')
    const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
    const base = FIXTURE_CANDIDATES.find((c) => c.id === 'fx-nok')!

    const lateVenue = {
      ...base,
      hours: { saturday: [{ opens: 'T20:00:00', closed: false, closes: 'T02:00:00' }] },
    }
    const window: TimeWindow = normaliseWindow(22, 2)
    const ctx = { requestedTagIds: [], timeWindow: window, usedCategories: [] }

    expect(scoreCandidate(lateVenue, 'main', ctx)).toBe(
      scoreCandidate(base, 'main', ctx),
    )
  })

  it('still penalises a venue that shuts at 15:00 for a 22:00 to 02:00 night', async () => {
    const { scoreCandidate } = await import('./score')
    const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
    const base = FIXTURE_CANDIDATES.find((c) => c.id === 'fx-nok')!

    const daytimeOnly = {
      ...base,
      hours: { saturday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }] },
    }
    const ctx = {
      requestedTagIds: [],
      timeWindow: normaliseWindow(22, 2),
      usedCategories: [],
    }
    expect(scoreCandidate(base, 'main', ctx)).toBeGreaterThan(
      scoreCandidate(daytimeOnly, 'main', ctx),
    )
  })
})
