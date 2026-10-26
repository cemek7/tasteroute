import { labelForHere } from './here'
import { CONSTRAINT_LABELS } from './labels'
import { ACCESSIBILITY_TAGS, DIETARY_TAGS } from './vocabulary'
import type { HardConstraints, Intent, IntentEcho } from '../providers/types'

const FAMOUS_FLOOR = 0.8
const HIDDEN_CEILING = 0.5

/**
 * A newcomer asking for an evening out does not want the mall. Qloo's
 * unfiltered answer for a city is its most famous places — Abuja comes back
 * at popularity 0.98 and above — so leaving this unset is itself a choice.
 */
const PERSONA_DISCOVERY: Record<Intent['persona'] & string, number> = {
  newcomer: 0.75,
  visiting: 0.6,
  local: 0.4,
}

/**
 * The discovery value the search will actually use. The slider needs this,
 * not its own 0.5: showing the midpoint while a chosen persona quietly
 * applies 0.75 tells the person something untrue about their own search.
 */
export function effectiveDiscovery(intent: Intent): number | undefined {
  return intent.discovery ?? (intent.persona ? PERSONA_DISCOVERY[intent.persona] : undefined)
}

/**
 * Turns the half of the intent our code owns into Qloo parameters. The agent
 * never sees these: a budget ceiling or a dietary need that could be weighed
 * against a taste match is not a constraint.
 */
export function constraintsFromIntent(intent: Intent): {
  constraints: HardConstraints
  applied: IntentEcho['applied']
} {
  const constraints: HardConstraints = {}
  const applied: IntentEcho['applied'] = []

  const discovery = effectiveDiscovery(intent)

  if (discovery !== undefined) {
    if (discovery < 1 / 3) {
      constraints.popularityMin = FAMOUS_FLOOR
      applied.push({
        label: CONSTRAINT_LABELS.popularityMin,
        detail: `only places Qloo rates above ${FAMOUS_FLOOR} for popularity`,
      })
    } else if (discovery > 2 / 3) {
      constraints.popularityMax = HIDDEN_CEILING
      applied.push({
        label: CONSTRAINT_LABELS.popularityMax,
        detail: `only places Qloo rates below ${HIDDEN_CEILING} for popularity`,
      })
    }
  }

  if (intent.budget !== undefined && intent.budget < 4) {
    constraints.priceLevelMax = intent.budget
    applied.push({
      label: CONSTRAINT_LABELS.priceLevelMax,
      detail: `nothing above price level ${intent.budget} of 4`,
    })
  }

  if (intent.area) {
    if (intent.here) {
      // A real position from the browser. Better than any centre we could
      // guess, and it needs no lookup.
      constraints.radius = { ...intent.here, metres: intent.area.radiusMetres }
      applied.push({
        label: CONSTRAINT_LABELS.radius,
        detail: labelForHere(intent.area.radiusMetres),
      })
    } else {
      // No position, so the caller resolves a city centre. 0,0 is a
      // placeholder it must replace before a query is built — it is in the
      // Gulf of Guinea, so a leak would be obvious rather than subtle.
      constraints.radius = { lat: 0, lng: 0, metres: intent.area.radiusMetres }
      applied.push({
        label: CONSTRAINT_LABELS.radius,
        detail: `within ${(intent.area.radiusMetres / 1000).toFixed(1)}km of the centre`,
      })
    }
  }

  // Dietary and accessibility needs are not taste. Somebody who needs a
  // wheelchair-accessible entrance and gets a venue without one has been
  // failed, however good the cocktails are — so these are hard filters the
  // agent cannot weigh against anything.
  const requiredTags = [
    ...(intent.requirements?.dietary ?? []).map((d) => DIETARY_TAGS[d]),
    ...(intent.requirements?.accessibility ?? []).map((a) => ACCESSIBILITY_TAGS[a]),
  ]
  if (requiredTags.length > 0) {
    constraints.requiredTags = requiredTags
    const names = [
      ...(intent.requirements?.dietary ?? []),
      ...(intent.requirements?.accessibility ?? []),
    ].map((n) => n.replace(/_/g, ' '))
    applied.push({ label: CONSTRAINT_LABELS.requiredTags, detail: names.join(', ') })
  }

  if (intent.avoid?.length) {
    constraints.excludeTags = intent.avoid
    applied.push({ label: CONSTRAINT_LABELS.excludeTags, detail: intent.avoid.join(', ') })
  }

  if (intent.demographics?.ageBand || intent.demographics?.gender) {
    constraints.demographics = {
      ageBand: intent.demographics.ageBand,
      gender: intent.demographics.gender,
    }
    // Deliberately NOT pushed to `applied`: echoing somebody's age and gender
    // back at them on a results page is not a feature.
  }

  return { constraints, applied }
}
