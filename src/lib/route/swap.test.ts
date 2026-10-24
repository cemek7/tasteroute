import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute, type BuildInput } from './build'
import { swapStop } from './swap'
import type { Route, SlotName } from '../providers/types'

const route = (): Route => {
  const r = buildRoute({
    candidates: FIXTURE_CANDIDATES,
    request: {
      city: 'Lagos',
      mood: 'anything',
      timeWindow: { startHour: 18, endHour: 23 },
      intent: {},
    },
    locality: { name: 'Lagos' },
    requestedTagIds: [],
    explainability: null,
    seedNames: {},
    trace: [],
    providerKind: 'fixture',
    intentEcho: { applied: [], ignored: [] },
  } satisfies BuildInput)
  if ('error' in r) throw new Error('expected a route')
  return r
}

const slotWithOptions = (r: Route): SlotName =>
  (['open', 'main', 'close'] as const).find((s) => r.alternativesBySlot[s].length > 0)!

describe('alternativesBySlot', () => {
  it('offers runners-up for at least one slot', () => {
    const r = route()
    expect(Object.values(r.alternativesBySlot).flat().length).toBeGreaterThan(0)
  })

  it('never offers a candidate already in the route', () => {
    const r = route()
    const inRoute = new Set(r.stops.map((s) => s.candidate.id))
    for (const list of Object.values(r.alternativesBySlot)) {
      for (const c of list) expect(inRoute.has(c.id)).toBe(false)
    }
  })

  it('never offers a candidate whose category another stop already uses', () => {
    const r = route()
    for (const slot of ['open', 'main', 'close'] as const) {
      const others = r.stops.filter((s) => s.slot !== slot).map((s) => s.candidate.category)
      for (const c of r.alternativesBySlot[slot]) expect(others).not.toContain(c.category)
    }
  })

  it('never offers a closed venue', () => {
    const r = route()
    for (const list of Object.values(r.alternativesBySlot)) {
      for (const c of list) expect(c.isClosed).not.toBe(true)
    }
  })
})

describe('swapStop', () => {
  it('replaces the named stop and keeps three stops', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const replacement = r.alternativesBySlot[slot][0]
    const next = swapStop(r, slot, replacement.id)
    expect(next.stops).toHaveLength(3)
    expect(next.stops.find((s) => s.slot === slot)?.candidate.id).toBe(replacement.id)
  })

  it('keeps the close slot last after a swap', () => {
    const r = route()
    const slot = slotWithOptions(r)
    expect(swapStop(r, slot, r.alternativesBySlot[slot][0].id).stops.at(-1)?.slot).toBe('close')
  })

  it('renumbers the stops 1, 2, 3', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.stops.map((s) => s.order)).toEqual([1, 2, 3])
  })

  it('rebuilds the narrative for the new set', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(typeof next.narrative.line).toBe('string')
    expect(next.narrative.line.endsWith('.')).toBe(true)
  })

  it('returns the route unchanged for an unknown candidate id', () => {
    const r = route()
    expect(swapStop(r, 'main', 'no-such-place')).toEqual(r)
  })

  it('moves the swapped-out place into the alternatives', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const original = r.stops.find((s) => s.slot === slot)!.candidate.id
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.alternativesBySlot[slot].map((c) => c.id)).toContain(original)
  })

  it('does not offer the newly placed candidate as its own alternative', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const chosen = r.alternativesBySlot[slot][0].id
    const next = swapStop(r, slot, chosen)
    expect(next.alternativesBySlot[slot].map((c) => c.id)).not.toContain(chosen)
  })

  it('gives the new stop a reason rather than inheriting the old one', () => {
    const r = route()
    const slot = slotWithOptions(r)
    const oldWhy = r.stops.find((s) => s.slot === slot)!.why
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.stops.find((s) => s.slot === slot)?.why).not.toBe(oldWhy)
  })
})
