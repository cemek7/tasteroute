import { describe, expect, it } from 'vitest'
import { MIN_STOPS, phasesFor } from './phases'
import { normaliseWindow } from './window'

describe('phasesFor', () => {
  it('plans the classic evening when the window is an evening', () => {
    expect(phasesFor(normaliseWindow(18, 23))).toEqual(['open', 'main', 'close'])
  })

  it('adds a late phase when the night runs past midnight', () => {
    expect(phasesFor(normaliseWindow(19, 2))).toEqual(['open', 'main', 'close', 'late'])
  })

  it('starts in the morning when the window does', () => {
    expect(phasesFor(normaliseWindow(9, 17))).toEqual([
      'morning',
      'activity',
      'main',
      'afternoon',
    ])
  })

  it('plans a whole day and night when the window covers both', () => {
    const phases = phasesFor(normaliseWindow(10, 1))
    expect(phases).toEqual(['morning', 'activity', 'main', 'close', 'late'])
  })

  it('never plans fewer stops than a route needs', () => {
    for (const [s, e] of [[18, 20], [21, 23], [12, 14], [8, 10]]) {
      expect(phasesFor(normaliseWindow(s, e)).length).toBeGreaterThanOrEqual(MIN_STOPS)
    }
  })

  it('always includes main, which anchors the route', () => {
    for (const [s, e] of [[9, 17], [18, 23], [19, 2], [10, 1], [21, 3]]) {
      expect(phasesFor(normaliseWindow(s, e))).toContain('main')
    }
  })

  it('keeps every phase list in chronological order', () => {
    const clock = ['morning', 'activity', 'open', 'main', 'afternoon', 'close', 'late']
    for (const [s, e] of [[9, 17], [18, 23], [19, 2], [10, 1]]) {
      const phases = phasesFor(normaliseWindow(s, e))
      const indices = phases.map((p) => clock.indexOf(p))
      expect(indices).toEqual([...indices].sort((a, b) => a - b))
    }
  })

  it('is deterministic', () => {
    expect(phasesFor(normaliseWindow(10, 1))).toEqual(phasesFor(normaliseWindow(10, 1)))
  })
})
