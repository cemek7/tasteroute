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
 * The close slot is always last, so only the open/main pair can swap.
 * With two permutations this is exact, not heuristic. Legs between stops
 * without coordinates count as zero for comparison and are omitted from
 * the output rather than reported as NaN.
 */
export function orderStops(chosen: Record<SlotName, Candidate>): OrderedStop[] {
  const permutations: SlotName[][] = [
    ['open', 'main', 'close'],
    ['main', 'open', 'close'],
  ]

  const legs = (order: SlotName[]) =>
    order.slice(1).map((slot, i) =>
      haversineMetres(
        { lat: chosen[order[i]].lat, lng: chosen[order[i]].lng },
        { lat: chosen[slot].lat, lng: chosen[slot].lng },
      ),
    )

  const best = permutations.reduce((a, b) => {
    const sum = (o: SlotName[]) => legs(o).reduce((s, d) => s + (d ?? 0), 0)
    return sum(b) < sum(a) ? b : a
  })

  const bestLegs = legs(best)
  return best.map((slot, i): OrderedStop => {
    const metres = i === 0 ? null : bestLegs[i - 1]
    const walkable = metres != null && Number.isFinite(metres)
    return {
      slot,
      candidate: chosen[slot],
      ...(walkable
        ? { walkFromPrev: { metres: Math.round(metres), minutes: walkMinutes(metres) } }
        : {}),
    }
  })
}
