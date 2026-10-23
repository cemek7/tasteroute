import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { assessSignal } from './assess'
import type { Candidate } from '../providers/types'

describe('assessSignal', () => {
  it('calls a full fixture set strong', () => {
    expect(assessSignal(FIXTURE_CANDIDATES).confidence).toBe('strong')
  })

  it('calls an empty set weak and says so', () => {
    const r = assessSignal([])
    expect(r.confidence).toBe('weak')
    expect(r.reason).toMatch(/no/i)
  })

  it('calls a set with fewer than six eligible candidates weak', () => {
    expect(assessSignal(FIXTURE_CANDIDATES.slice(0, 4)).confidence).toBe('weak')
  })

  it('calls a set weak when median affinity is below 0.3', () => {
    const dull: Candidate[] = FIXTURE_CANDIDATES.map((c) => ({ ...c, affinity: 0.1 }))
    expect(assessSignal(dull).confidence).toBe('weak')
  })

  it('names the thin slot in its reason', () => {
    const noBars = FIXTURE_CANDIDATES.filter(
      (c) => !c.category?.includes('bar') && c.category !== 'lounge',
    )
    expect(assessSignal(noBars).reason.toLowerCase()).toContain('close')
  })

  it('counts eligible candidates per slot, excluding closed venues', () => {
    const r = assessSignal(FIXTURE_CANDIDATES)
    expect(r.perSlot.open).toBeGreaterThanOrEqual(3)
    expect(r.perSlot.main).toBeGreaterThanOrEqual(3)
    expect(r.perSlot.close).toBeGreaterThanOrEqual(3)
  })

  it('reports null median affinity when no candidate has one', () => {
    const none: Candidate[] = FIXTURE_CANDIDATES.map((c) => ({ ...c, affinity: null }))
    expect(assessSignal(none).medianAffinity).toBeNull()
  })

  it('grades ok, not strong, when a slot has fewer than three options', () => {
    // Drop two of the three open venues, leaving one.
    const thinOpen = FIXTURE_CANDIDATES.filter(
      (c) => c.category !== 'bakery' && c.category !== 'gallery',
    )
    expect(assessSignal(thinOpen).confidence).toBe('ok')
  })
})
