import { CONSTRAINT_LABELS, type LabelledConstraint } from './labels'
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
const ORDER: LabelledConstraint[] = [
  'radius',
  'popularityMax',
  'popularityMin',
  'priceLevelMax',
  'requiredTags',
]

/** Kept as a named re-export so existing callers do not have to change. */
export const RELAX_LABELS = CONSTRAINT_LABELS

export function relaxOrder(constraints: HardConstraints): LabelledConstraint[] {
  return ORDER.filter((k) => constraints[k] !== undefined)
}

/**
 * Dietary needs are kept longest. Within a requirement set, an accessibility
 * tag is given up before a dietary one — not because it matters less, but
 * because Qloo tags accessibility sparsely, so it is the likelier reason the
 * intersection came back empty.
 */
function requirementGiveUpOrder(tags: string[]): string[] {
  const rank = (t: string) => (t.includes(':accessibility:') ? 0 : 1)
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export function relaxOnce(constraints: HardConstraints): {
  next: HardConstraints
  dropped: LabelledConstraint
  droppedDetail?: string
} | null {
  const dropped = relaxOrder(constraints)[0]
  if (!dropped) return null

  const next = { ...constraints }

  // A requirement set is given up one tag at a time. Dropping halal AND a
  // wheelchair entrance together, because their intersection was empty,
  // discards a need that might well have been satisfiable on its own.
  if (dropped === 'requiredTags' && constraints.requiredTags) {
    const [first, ...rest] = requirementGiveUpOrder(constraints.requiredTags)
    if (rest.length > 0) {
      next.requiredTags = rest
    } else {
      delete next.requiredTags
    }
    return {
      next,
      dropped,
      droppedDetail: first?.split(':').at(-1)?.replace(/_/g, ' '),
    }
  }

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
