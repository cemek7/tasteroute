import type { HardConstraints, TasteProvider } from '../providers/types'

/**
 * Hidden gems plus a hard budget plus a one-kilometre radius can intersect to
 * nothing. Rather than refuse, give up one constraint at a time, softest
 * first, and say what was given up.
 *
 * `requiredTags` goes last because it carries dietary and accessibility
 * needs: it is the thing a person is least willing to lose, so it is the last
 * thing we take. `excludeTags` is never dropped — somebody who said they do
 * not want hookah does not want hookah. Demographics are a signal rather than
 * a filter, so they never empty a pool and never need relaxing.
 */
const ORDER: (keyof HardConstraints)[] = [
  'radius',
  'popularityMax',
  'popularityMin',
  'priceLevelMax',
  'requiredTags',
]

export const RELAX_LABELS: Record<string, string> = {
  radius: 'Nearby only',
  popularityMax: 'Hidden gems',
  popularityMin: 'The well-known ones',
  priceLevelMax: 'Budget',
  requiredTags: 'Must-haves',
}

export function relaxOrder(constraints: HardConstraints): (keyof HardConstraints)[] {
  return ORDER.filter((k) => constraints[k] !== undefined)
}

export function relaxOnce(
  constraints: HardConstraints,
): { next: HardConstraints; dropped: keyof HardConstraints } | null {
  const dropped = relaxOrder(constraints)[0]
  if (!dropped) return null
  const next = { ...constraints }
  delete next[dropped]
  return { next, dropped }
}

/**
 * One untagged query, taking the first located result's coordinates as the
 * city centre. Qloo has no "centre of Abuja" endpoint, and its own top result
 * for a city is a reasonable stand-in for one.
 */
export async function cityCentre(
  provider: TasteProvider,
  locality: string,
): Promise<{ lat: number; lng: number } | null> {
  const { candidates } = await provider.suggestPlaces({ locality, take: 5 })
  const located = candidates.find((c) => c.lat != null && c.lng != null)
  return located ? { lat: located.lat!, lng: located.lng! } : null
}
