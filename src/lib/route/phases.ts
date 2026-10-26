import type { SlotName } from '../providers/types'
import type { TimeWindow } from './window'

/**
 * Chronological. A plan's phases are always a subset of this list in this
 * order, which is what makes "you cannot have the last drink before lunch"
 * a property of the data rather than a rule somebody has to remember.
 */
export const CLOCK: SlotName[] = [
  'morning',
  'activity',
  'open',
  'main',
  'afternoon',
  'close',
  'late',
]

/** Three stops is a plan. Two is a suggestion. */
export const MIN_STOPS = 3

/** Five is where a day stops being a plan and starts being a schedule. */
export const MAX_STOPS = 5

/** Before noon, the plan starts with breakfast rather than a pre-dinner drink. */
const MORNING_START = 11

/** `normaliseWindow` carries a post-midnight end past 24, so 25 is 1am. */
const PAST_MIDNIGHT = 25

/** There is enough evening left for a last drink. */
const EVENING_TAIL = 20

/**
 * Which parts of the day this plan has. A window is the only honest source
 * for this: somebody out from ten in the morning wants a different shape of
 * day from somebody out from nine at night, and asking them to say so twice
 * would be asking them to repeat themselves.
 *
 * `main` is always present. It is the sit-down meal the rest clusters
 * around — lunch for a daytime plan, dinner for an evening one — and the
 * builder uses it as the geographic anchor.
 */
export function phasesFor(window: TimeWindow): SlotName[] {
  const daytime = window.startHour <= MORNING_START
  const pastMidnight = window.endHour >= PAST_MIDNIGHT
  const hasEvening = window.endHour >= EVENING_TAIL

  const chosen = new Set<SlotName>(['main'])

  if (daytime) {
    chosen.add('morning')
    chosen.add('activity')
  } else {
    chosen.add('open')
  }

  // An afternoon only earns a phase when the plan is not also running into
  // the night; five stops is already a long day.
  if (daytime && !pastMidnight) chosen.add('afternoon')
  if (hasEvening) chosen.add('close')
  if (pastMidnight) chosen.add('late')

  // A short window can land on two phases. Something to do is a better third
  // than a drink nobody asked for.
  if (chosen.size < MIN_STOPS) chosen.add('activity')
  if (chosen.size < MIN_STOPS) chosen.add('close')

  return CLOCK.filter((p) => chosen.has(p)).slice(0, MAX_STOPS)
}
