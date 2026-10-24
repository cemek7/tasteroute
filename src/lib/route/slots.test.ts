import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { slotFit, slotsFor } from './slots'
import type { Candidate } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

describe('slotsFor', () => {
  it('puts a cafe in the open slot', () => {
    expect(slotsFor(byId('fx-cafe-neo'))).toEqual(['open'])
  })

  it('puts a restaurant in the main slot', () => {
    expect(slotsFor(byId('fx-nok'))).toContain('main')
  })

  it('puts a cocktail bar in the close slot', () => {
    expect(slotsFor(byId('fx-bar-slate'))).toContain('close')
  })

  it('allows a bakery in the open slot', () => {
    expect(slotsFor(byId('fx-bakery-rise'))).toContain('open')
  })

  it('returns an empty array for a candidate with no recognisable tags', () => {
    const orphan: Candidate = {
      ...byId('fx-cafe-neo'),
      category: null,
      primaryGenre: null,
      tags: [],
    }
    expect(slotsFor(orphan)).toEqual([])
  })
})

describe('slotFit', () => {
  it('scores a cocktail bar higher for close than for main', () => {
    const c = byId('fx-bar-slate')
    expect(slotFit(c, 'close')).toBeGreaterThan(slotFit(c, 'main'))
  })

  it('returns zero for a slot the candidate is not eligible for', () => {
    expect(slotFit(byId('fx-cafe-neo'), 'close')).toBe(0)
  })

  it('never exceeds one', () => {
    for (const c of FIXTURE_CANDIDATES) {
      for (const s of ['open', 'main', 'close'] as const) {
        expect(slotFit(c, s)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('only going-out venues get a slot', () => {
  const withGenre = (id: string | null, category: string | null = null): Candidate => ({
    ...byId('fx-cafe-neo'),
    id: `g-${id}`,
    name: 'Somewhere',
    category,
    primaryGenre: id,
    tags: [],
  })

  it('refuses a housing complex at any affinity', () => {
    const estate = { ...withGenre('urn:tag:genre:place:housing_complex'), affinity: 0.99 }
    expect(slotsFor(estate)).toEqual([])
  })

  it('refuses car parks, offices and shops', () => {
    for (const id of [
      'urn:tag:genre:place:car_park',
      'urn:tag:genre:place:office',
      'urn:tag:genre:place:hardware_store',
      'urn:tag:genre:place:supermarket',
    ]) {
      expect(slotsFor(withGenre(id)), id).toEqual([])
    }
  })

  it('accepts the going-out kinds', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:cafe'))).toEqual(['open'])
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant'))).toEqual(['main'])
    expect(slotsFor(withGenre('urn:tag:genre:place:bar:cocktail_bar'))).toEqual(['close'])
  })

  it('still reads a nested barbecue genre as dinner', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant:barbecue'))).toEqual(['main'])
  })

  it('falls back to category and tags when primary_genre is absent', () => {
    expect(slotsFor(withGenre(null, 'cafe'))).toEqual(['open'])
  })
})
