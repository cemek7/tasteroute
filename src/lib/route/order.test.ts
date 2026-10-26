import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { haversineMetres, orderStops, walkMinutes } from './order'
import type { Candidate, SlotName } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

describe('haversineMetres', () => {
  it('returns zero for the same point', () => {
    expect(haversineMetres({ lat: 6.43, lng: 3.42 }, { lat: 6.43, lng: 3.42 })).toBe(0)
  })

  it('returns roughly 1.1km for a 0.01 degree latitude step', () => {
    const d = haversineMetres({ lat: 6.43, lng: 3.42 }, { lat: 6.44, lng: 3.42 })
    expect(d).toBeGreaterThan(1050)
    expect(d).toBeLessThan(1160)
  })

  it('returns null when either point lacks coordinates', () => {
    expect(haversineMetres({ lat: null, lng: 3.42 }, { lat: 6.44, lng: 3.42 })).toBeNull()
    expect(haversineMetres({ lat: 6.43, lng: 3.42 }, { lat: null, lng: null })).toBeNull()
  })
})

describe('walkMinutes', () => {
  it('walks 80 metres a minute, rounded up', () => {
    expect(walkMinutes(800)).toBe(10)
    expect(walkMinutes(10)).toBe(1)
  })
})

describe('orderStops', () => {
  const chosen: Partial<Record<SlotName, Candidate>> = {
    open: byId('fx-gallery-ember'),
    main: byId('fx-nok'),
    close: byId('fx-bar-slate'),
  }

  it('always puts the close slot last', () => {
    expect(orderStops(chosen).at(-1)?.slot).toBe('close')
  })

  it('returns exactly three stops', () => {
    expect(orderStops(chosen)).toHaveLength(3)
  })

  it('picks the permutation with the shorter total walk', () => {
    const ordered = orderStops(chosen)
    const total = ordered.reduce((s, st) => s + (st.walkFromPrev?.metres ?? 0), 0)

    const flipped = [ordered[1], ordered[0], ordered[2]]
    let alt = 0
    for (let i = 1; i < flipped.length; i++) {
      const d = haversineMetres(
        { lat: flipped[i - 1].candidate.lat, lng: flipped[i - 1].candidate.lng },
        { lat: flipped[i].candidate.lat, lng: flipped[i].candidate.lng },
      )
      alt += d ?? 0
    }
    expect(total).toBeLessThanOrEqual(alt)
  })

  it('omits walkFromPrev rather than reporting NaN when a stop has no coordinates', () => {
    const noGeo: Candidate = { ...byId('fx-nok'), lat: null, lng: null }
    const ordered = orderStops({ ...chosen, main: noGeo })
    expect(ordered).toHaveLength(3)
    for (const stop of ordered) {
      if (stop.walkFromPrev) {
        expect(Number.isFinite(stop.walkFromPrev.metres)).toBe(true)
        expect(Number.isFinite(stop.walkFromPrev.minutes)).toBe(true)
      }
    }
  })

  it('never sets walkFromPrev on the first stop', () => {
    expect(orderStops(chosen)[0].walkFromPrev).toBeUndefined()
  })
})
