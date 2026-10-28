import type { Stop } from '../providers/types'

/**
 * Qloo publishes a 1-4 price level for roughly one place in five, and nothing
 * else about cost: no menu, no currency, no total. So this says what the band
 * is and how much of the plan it covers, and never turns four bands into a
 * number of naira. A plan whose stops Qloo never priced says nothing at all —
 * silence is honest, "affordable" would not be.
 */
const BAND: Record<number, string> = {
  1: 'cheap',
  2: 'mid-range',
  3: 'pricey',
  4: 'top end',
}

const COUNT_WORD = ['', 'one', 'two', 'three', 'four', 'five']

export type PlanBudget = {
  /** Stops Qloo gave a band for. */
  priced: number
  total: number
  /** The bands, commonest first. */
  bands: { level: number; label: string; count: number }[]
  line: string
}

function bandOf(stop: Stop): number | null {
  const level = stop.candidate.priceLevel
  if (typeof level !== 'number') return null
  const rounded = Math.round(level)
  return rounded in BAND ? rounded : null
}

export function planBudget(stops: Stop[]): PlanBudget | null {
  const levels = stops.map(bandOf).filter((l): l is number => l !== null)
  if (levels.length === 0) return null

  const counts = new Map<number, number>()
  for (const l of levels) counts.set(l, (counts.get(l) ?? 0) + 1)

  const bands = [...counts.entries()]
    .map(([level, count]) => ({ level, label: BAND[level], count }))
    // Commonest first, then cheapest first, so the line is stable.
    .sort((a, b) => b.count - a.count || a.level - b.level)

  const parts = bands.map((b) => `${COUNT_WORD[b.count] ?? b.count} ${b.label}`)
  const everyStop = levels.length === stops.length
  const coverage = everyStop
    ? `Qloo priced all ${stops.length} stops`
    : `Qloo priced ${levels.length} of ${stops.length}`

  // "Throughout" is a claim about the whole plan, so it is only earned when
  // Qloo gave a band for every stop. Qloo prices roughly one place in ten in
  // the cities we tested, so the partial case is the usual one.
  const line =
    bands.length === 1
      ? everyStop
        ? `${capitalise(bands[0].label)} throughout — ${coverage}.`
        : `${capitalise(bands[0].label)} where Qloo has a price — ${levels.length} of ${stops.length} stops.`
      : `${capitalise(parts[0])}, ${parts.slice(1).join(', ')} — ${coverage}.`

  return { priced: levels.length, total: stops.length, bands, line }
}

/** The band for one place, for the chip on its card. */
export function bandLabel(priceLevel: number | null | undefined): string | null {
  if (typeof priceLevel !== 'number') return null
  const rounded = Math.round(priceLevel)
  return rounded in BAND ? BAND[rounded] : null
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
