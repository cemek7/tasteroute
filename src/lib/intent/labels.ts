import type { HardConstraints } from '../providers/types'

/**
 * One name per constraint, used both when it is applied and when it is
 * relaxed. They lived in two places and drifted — "Must have" against
 * "Must-haves" — so the echo reported a requirement as applied and relaxed at
 * the same time. Anything that can be relaxed is keyed here.
 */
/**
 * Demographics are deliberately absent. They are a taste signal, never
 * echoed back to the person and never relaxed, so a label for them could
 * only ever be unreachable. The type says that; a comment alone did not.
 */
export type LabelledConstraint = Exclude<keyof HardConstraints, 'demographics'>

export const CONSTRAINT_LABELS: Record<LabelledConstraint, string> = {
  popularityMax: 'Hidden gems',
  popularityMin: 'The well-known ones',
  priceLevelMax: 'Budget',
  radius: 'Nearby only',
  requiredTags: 'Must-haves',
  excludeTags: 'Avoiding',
}
