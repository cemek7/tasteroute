import type { TimeWindow } from './window'
import type { SlotName, Stop } from '../providers/types'

/**
 * An estimated clock for the plan, built from two things the app already
 * knows: the hours the person gave, and the walk between each pair of stops.
 *
 * It is not a booking and the app must not imply one. What it buys is the
 * difference between a list of places and a plan: you can see that dinner
 * lands at half seven and the last stop is not stranded after closing.
 */
const DWELL: Record<SlotName, number> = {
  morning: 45,
  open: 45,
  activity: 75,
  afternoon: 75,
  main: 90,
  close: 75,
  late: 90,
}

/** Below this a stop is a queue, not a visit. */
const MIN_DWELL = 30

export type ScheduledStop = {
  order: number
  arriveMinutes: number
  departMinutes: number
  arrive: string
  depart: string
}

export function scheduleStops(stops: Stop[], window: TimeWindow): ScheduledStop[] {
  const walks = stops.map((s) => s.walkFromPrev?.minutes ?? 0)
  const dwells = stops.map((s) => DWELL[s.slot] ?? MIN_DWELL)

  const available = (window.endHour - window.startHour) * 60
  const walking = walks.reduce((a, b) => a + b, 0)
  const wanted = dwells.reduce((a, b) => a + b, 0)

  // Tight hours shorten the stops; they never push the plan past the end the
  // person chose. Below MIN_DWELL it stops shrinking and the plan simply
  // overruns, because a five-minute drink is not a stop.
  const factor = wanted > 0 ? Math.min(1, (available - walking) / wanted) : 1
  const actual = dwells.map((d) => Math.max(MIN_DWELL, Math.round(d * factor)))

  const rows: ScheduledStop[] = []
  let clock = window.startHour * 60
  for (let i = 0; i < stops.length; i++) {
    clock += walks[i]
    const arrive = clock
    clock += actual[i]
    rows.push({
      order: stops[i].order,
      arriveMinutes: arrive,
      departMinutes: clock,
      arrive: clockLabel(arrive),
      depart: clockLabel(clock),
    })
  }
  return rows
}

/** 1110 -> "6:30pm". Minutes past 24:00 wrap into the small hours. */
export function clockLabel(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, '0')}${suffix}`
}
