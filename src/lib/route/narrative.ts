import { isOpenDuring } from './open-tonight'
import type { TimeWindow } from './window'
import type { Evidence, Stop } from '../providers/types'

/**
 * A sentence about the shape of the evening, composed from facts already
 * computed: the venue kinds, a shared neighbourhood, the walking total, and
 * whether the last stop runs late.
 *
 * Not model-written, for the same reason the per-stop reasons are not. Every
 * clause can be pointed at a field, and a clause with nothing behind it is
 * simply left out — which is why the line is short when the data is thin.
 */
export function buildNarrative(
  stops: Stop[],
  window: TimeWindow,
): { line: string; evidence: Evidence[] } {
  const clauses: string[] = []
  const evidence: Evidence[] = []

  const kind = (s: Stop) => s.candidate.category?.replace(/_/g, ' ') ?? null
  const first = kind(stops[0])
  const last = kind(stops[stops.length - 1])

  const areas = stops
    .map((s) => s.candidate.detail?.neighborhood)
    .filter((n): n is string => !!n)
  const shared =
    areas.length === stops.length && new Set(areas).size === 1 ? areas[0] : null

  // A plan is three to five stops, so the count is worth saying in words.
  const COUNT_WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five']
  const count = COUNT_WORD[stops.length] ?? `${stops.length}`

  if (first) {
    clauses.push(shared ? `Starts at a ${first} in ${shared}` : `Starts at a ${first}`)
    evidence.push({ kind: 'tag', label: `opens at a ${first}`, source: 'qloo' })
  } else if (shared) {
    clauses.push(`${count} stops in ${shared}`)
  } else {
    clauses.push(`${count} stops`)
  }

  if (last && last !== first) {
    clauses.push(`finishes at a ${last}`)
    evidence.push({ kind: 'tag', label: `closes at a ${last}`, source: 'qloo' })
  }

  const legs = stops.map((s) => s.walkFromPrev?.minutes).filter((m): m is number => m != null)
  if (legs.length > 0) {
    clauses.push(`${legs.reduce((a, b) => a + b, 0)} minutes of walking in total`)
  }

  // Only worth saying when the night itself runs past midnight.
  const runsLate =
    window.endHour > 24 &&
    isOpenDuring(stops[stops.length - 1].candidate.hours, window) === true
  if (runsLate) {
    clauses.push('and the last one is still open past midnight')
    evidence.push({ kind: 'descriptor', label: 'open past midnight', source: 'qloo' })
  }

  return { line: `${clauses.join(', ')}.`, evidence }
}
