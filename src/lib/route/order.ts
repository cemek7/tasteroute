import { CLOCK } from './phases'
import type { Candidate, SlotName } from '../providers/types'

type Point = { lat: number | null; lng: number | null }

const EARTH_RADIUS_M = 6_371_000
const WALK_METRES_PER_MINUTE = 80

export function haversineMetres(a: Point, b: Point): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function walkMinutes(metres: number): number {
  return Math.max(1, Math.ceil(metres / WALK_METRES_PER_MINUTE))
}

export type OrderedStop = {
  slot: SlotName
  candidate: Candidate
  walkFromPrev?: { metres: number; minutes: number }
}

/**
 * Stops come out in the plan's chronological order, which `route/phases.ts`
 * owns. One exception, kept because it was measured to matter: in the
 * classic evening the open and main stops are interchangeable in time, so
 * both orders are tried and the shorter walk wins. With two permutations
 * that is exact, not heuristic.
 *
 * Anywhere else the clock is not negotiable — breakfast does not go after
 * lunch to save four hundred metres — so chronological order stands.
 *
 * Legs between stops without coordinates count as zero for comparison and
 * are omitted from the output rather than reported as NaN.
 */
export function orderStops(chosen: Partial<Record<SlotName, Candidate>>): OrderedStop[] {
  const present = (CLOCK as SlotName[]).filter((s) => chosen[s] !== undefined)
  const isClassicEvening =
    present.length === 3 &&
    present[0] === 'open' &&
    present[1] === 'main' &&
    present[2] === 'close'

  const permutations: SlotName[][] = isClassicEvening
    ? [
        ['open', 'main', 'close'],
        ['main', 'open', 'close'],
      ]
    : [present]

  const at = (slot: SlotName): Point => {
    const c = chosen[slot]
    return { lat: c?.lat ?? null, lng: c?.lng ?? null }
  }

  const legs = (order: SlotName[]) =>
    order.slice(1).map((slot, i) => haversineMetres(at(order[i]), at(slot)))

  const sum = (o: SlotName[]): number =>
    legs(o).reduce<number>((total, leg) => total + (leg ?? 0), 0)

  const best = permutations.reduce((a, b) => (sum(b) < sum(a) ? b : a))

  const bestLegs = legs(best)
  return best.map((slot, i): OrderedStop => {
    const metres = i === 0 ? null : bestLegs[i - 1]
    const walkable = metres != null && Number.isFinite(metres)
    return {
      slot,
      candidate: chosen[slot] as Candidate,
      ...(walkable
        ? { walkFromPrev: { metres: Math.round(metres), minutes: walkMinutes(metres) } }
        : {}),
    }
  })
}
