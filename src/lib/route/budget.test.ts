import { describe, expect, it } from 'vitest'
import { planBudget } from './budget'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import type { SlotName, Stop } from '../providers/types'

const stop = (i: number, priceLevel?: number | null): Stop => ({
  order: i + 1,
  slot: (['open', 'main', 'close', 'late'] as SlotName[])[i],
  candidate: { ...FIXTURE_CANDIDATES[i], priceLevel },
  why: 'x',
  evidence: [],
})

describe('planBudget', () => {
  it('says nothing when Qloo published no price for any stop', () => {
    expect(planBudget([stop(0), stop(1), stop(2)])).toBeNull()
  })

  it('counts only the stops Qloo priced, and says how many that was', () => {
    const b = planBudget([stop(0, 2), stop(1, 2), stop(2, null)])
    expect(b?.priced).toBe(2)
    expect(b?.total).toBe(3)
    expect(b?.line).toContain('2 of 3')
  })

  it('names the band when every priced stop agrees', () => {
    const b = planBudget([stop(0, 2), stop(1, 2), stop(2, 2)])
    expect(b?.line).toMatch(/mid-range/i)
    expect(b?.line).not.toContain(',')
  })

  it('mentions the stop that breaks the pattern', () => {
    const b = planBudget([stop(0, 2), stop(1, 2), stop(2, 4)])
    expect(b?.line).toMatch(/mid-range/)
    expect(b?.line).toMatch(/top end/)
  })

  it('leads with the commonest band, not the first stop', () => {
    const b = planBudget([stop(0, 4), stop(1, 1), stop(2, 1)])
    expect(b?.line.indexOf('cheap')).toBeLessThan(b!.line.indexOf('top end'))
  })

  it('only claims a band runs throughout when every stop was priced', () => {
    // Qloo prices roughly one place in ten here, so "mid-range throughout"
    // off a single priced stop would be the app inventing three bands.
    const thin = planBudget([stop(0, 2), stop(1, null), stop(2, null)])
    expect(thin?.line).not.toMatch(/throughout/i)
    expect(thin?.line).toMatch(/1 of 3/)

    const full = planBudget([stop(0, 2), stop(1, 2), stop(2, 2)])
    expect(full?.line).toMatch(/throughout/i)
  })

  it('never states a currency or a total, because Qloo gives neither', () => {
    const b = planBudget([stop(0, 1), stop(1, 3), stop(2, 4)])
    expect(b?.line).not.toMatch(/[₦$€£]/)
    expect(b?.line).not.toMatch(/\btotal\b/i)
  })

  it('ignores a level outside Qloo’s 1-4 band rather than labelling it', () => {
    expect(planBudget([stop(0, 0), stop(1, 9), stop(2, null)])).toBeNull()
  })
})
