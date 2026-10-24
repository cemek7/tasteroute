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

  const discovery =
    intent.discovery ?? (intent.persona ? PERSONA_DISCOVERY[intent.persona] : undefined)

  if (discovery !== undefined) {
    if (discovery < 1 / 3) {
      constraints.popularityMin = FAMOUS_FLOOR
      applied.push({
        label: 'The well-known ones',
        detail: `only places Qloo rates above ${FAMOUS_FLOOR} for popularity`,
      })
    } else if (discovery > 2 / 3) {
      constraints.popularityMax = HIDDEN_CEILING
      applied.push({
        label: 'Hidden gems',
        detail: `only places Qloo rates below ${HIDDEN_CEILING} for popularity`,
      })
    }
  }

  return { constraints, applied }
}
