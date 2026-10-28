import { describe, expect, it } from 'vitest'
import { scheduleStops } from './schedule'
import { normaliseWindow } from './window'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import type { SlotName, Stop } from '../providers/types'

const stop = (i: number, slot: SlotName, walk?: number): Stop => ({
  order: i + 1,
  slot,
  candidate: FIXTURE_CANDIDATES[i],
  why: 'x',
  evidence: [],
  ...(walk === undefined ? {} : { walkFromPrev: { metres: walk * 80, minutes: walk } }),
})

const evening = (): Stop[] => [
  stop(0, 'open'),
  stop(1, 'main', 8),
  stop(2, 'close', 6),
]

describe('scheduleStops', () => {
  it('starts the first stop at the hour the person said they were going out', () => {
    const [first] = scheduleStops(evening(), normaliseWindow(18, 23))
    expect(first.arrive).toBe('6pm')
  })

  it('gives every stop a later arrival than the one before', () => {
    const times = scheduleStops(evening(), normaliseWindow(18, 23)).map((s) => s.arriveMinutes)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(times).size).toBe(times.length)
  })

  it('leaves at least the walking time between leaving one stop and reaching the next', () => {
    const s = scheduleStops(evening(), normaliseWindow(18, 23))
    expect(s[1].arriveMinutes - s[0].departMinutes).toBe(8)
    expect(s[2].arriveMinutes - s[1].departMinutes).toBe(6)
  })

  it('finishes inside the hours it was given', () => {
    const s = scheduleStops(evening(), normaliseWindow(18, 23))
    expect(s[s.length - 1].departMinutes).toBeLessThanOrEqual(23 * 60)
  })

  it('shortens the stops rather than running past the end of a tight evening', () => {
    const s = scheduleStops(evening(), normaliseWindow(20, 23))
    expect(s[s.length - 1].departMinutes).toBeLessThanOrEqual(23 * 60)
    expect(s[0].departMinutes - s[0].arriveMinutes).toBeLessThan(45)
  })

  it('writes a time past midnight as the small hours, not as 25 o’clock', () => {
    const s = scheduleStops(
      [stop(0, 'open'), stop(1, 'main', 5), stop(2, 'late', 5)],
      // Out at eleven, so the later stops land after midnight. The window
      // carries its end past 24 and the labels must not.
      normaliseWindow(23, 4),
    )
    expect(s[0].arrive).toBe('11pm')
    expect(s[2].arrive).toMatch(/am$/)
    expect(s[2].arriveMinutes).toBeGreaterThan(24 * 60)
  })

  it('is the same schedule every time it is asked', () => {
    const a = scheduleStops(evening(), normaliseWindow(18, 23))
    const b = scheduleStops(evening(), normaliseWindow(18, 23))
    expect(a).toEqual(b)
  })

  it('never stops anywhere for less than half an hour, however tight the hours', () => {
    const s = scheduleStops(evening(), normaliseWindow(20, 21))
    for (const row of s) expect(row.departMinutes - row.arriveMinutes).toBeGreaterThanOrEqual(30)
  })
})
