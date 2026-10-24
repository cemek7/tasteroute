export type TimeWindow = { startHour: number; endHour: number }

const HOURS_IN_DAY = 24

/**
 * An evening out routinely crosses midnight: 22:00 until 02:00 is the normal
 * case, not an edge case. Comparing those as plain numbers says the evening
 * ends before it starts, which is how the app came to reject its own most
 * likely input.
 *
 * Carrying the end past 24 instead keeps every downstream comparison a simple
 * linear one, so opening-hours maths needs no special cases.
 */
export function normaliseWindow(startHour: number, endHour: number): TimeWindow {
  if (endHour > startHour) return { startHour, endHour }
  return { startHour, endHour: endHour + HOURS_IN_DAY }
}
