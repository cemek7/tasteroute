import { describe, expect, it } from 'vitest'
import { isOpenDuring } from './open-tonight'
import { normaliseWindow } from './window'

describe('isOpenDuring', () => {
  it('is null when a place publishes no hours, rather than guessing', () => {
    expect(isOpenDuring(null, normaliseWindow(18, 23))).toBeNull()
    expect(isOpenDuring({}, normaliseWindow(18, 23))).toBeNull()
  })

  it('is true for a place open across the window', () => {
    const hours = { friday: [{ opens: 'T17:00:00', closed: false, closes: 'T23:30:00' }] }
    expect(isOpenDuring(hours, normaliseWindow(18, 23))).toBe(true)
  })

  it('is false for a place that shuts before the window starts', () => {
    const hours = { friday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }] }
    expect(isOpenDuring(hours, normaliseWindow(18, 23))).toBe(false)
  })

  it('is true for a late bar on a night that crosses midnight', () => {
    const hours = { saturday: [{ opens: 'T20:00:00', closed: false, closes: 'T02:00:00' }] }
    expect(isOpenDuring(hours, normaliseWindow(22, 2))).toBe(true)
  })

  it('is null when every day is marked closed with no times', () => {
    const hours = {
      friday: [{ opens: null, closed: true, closes: null }],
      monday: [{ opens: null, closed: true, closes: null }],
    }
    expect(isOpenDuring(hours, normaliseWindow(18, 23))).toBeNull()
  })

  it('agrees with the scoring penalty for every case', async () => {
    const { scoreCandidate } = await import('./score')
    const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
    const base = FIXTURE_CANDIDATES[3]
    const window = normaliseWindow(18, 23)
    const ctx = { requestedTagIds: [], timeWindow: window, usedCategories: [] }

    const cases = [
      { friday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }] },
      { friday: [{ opens: 'T17:00:00', closed: false, closes: 'T23:30:00' }] },
    ]
    for (const hours of cases) {
      const penalised =
        scoreCandidate({ ...base, hours }, 'main', ctx) < scoreCandidate(base, 'main', ctx)
      // The card must never disagree with the score.
      expect(isOpenDuring(hours, window)).toBe(!penalised)
    }
  })
})
