import { describe, expect, it } from 'vitest'
import { buildNarrative } from './narrative'
import { normaliseWindow } from './window'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import type { Stop } from '../providers/types'

const stop = (i: number, over: Partial<Stop> = {}): Stop => ({
  order: (i + 1) as 1 | 2 | 3,
  slot: (['open', 'main', 'close'] as const)[i],
  candidate: FIXTURE_CANDIDATES[i],
  why: 'x',
  evidence: [],
  ...over,
})

const three = (): [Stop, Stop, Stop] => [stop(0), stop(1), stop(2)]

describe('buildNarrative', () => {
  it('names the opening venue kind', () => {
    const { line } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).toContain('cafe')
  })

  it('reports the total walk, matching the sum of the legs', () => {
    const stops = three()
    stops[1].walkFromPrev = { metres: 600, minutes: 8 }
    stops[2].walkFromPrev = { metres: 900, minutes: 12 }
    const { line } = buildNarrative(stops, normaliseWindow(18, 23))
    expect(line).toContain('20 minutes of walking')
  })

  it('does not mention walking when no leg could be measured', () => {
    const { line } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).not.toContain('walking')
  })

  it('mentions a late finish only when the last stop runs past midnight', () => {
    const stops = three()
    stops[2].candidate = {
      ...stops[2].candidate,
      hours: { saturday: [{ opens: 'T20:00:00', closed: false, closes: 'T02:00:00' }] },
    }
    const { line } = buildNarrative(stops, normaliseWindow(22, 2))
    expect(line).toMatch(/past midnight/)
  })

  it('does not mention a late finish for an ordinary evening', () => {
    const { line } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).not.toMatch(/past midnight/)
  })

  it('never claims a vibe no stop matched', () => {
    const { line, evidence } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).not.toMatch(/upscale/)
    expect(evidence.every((e) => e.source === 'qloo')).toBe(true)
  })

  it('names the neighbourhood when all three share one', () => {
    const stops = three().map((s) => ({
      ...s,
      candidate: { ...s.candidate, detail: { neighborhood: 'Wuse 2' } },
    })) as [Stop, Stop, Stop]
    expect(buildNarrative(stops, normaliseWindow(18, 23)).line).toContain('Wuse 2')
  })

  it('does not name a neighbourhood when the stops are spread across three', () => {
    const areas = ['Wuse 2', 'Maitama', 'Garki']
    const stops = three().map((s, i) => ({
      ...s,
      candidate: { ...s.candidate, detail: { neighborhood: areas[i] } },
    })) as [Stop, Stop, Stop]
    const { line } = buildNarrative(stops, normaliseWindow(18, 23))
    expect(line).not.toContain('Wuse 2')
  })

  it('stays short when there is little to say', () => {
    const bare = three().map((s) => ({
      ...s,
      candidate: { ...s.candidate, category: null, detail: undefined },
    })) as [Stop, Stop, Stop]
    const { line } = buildNarrative(bare, normaliseWindow(18, 23))
    expect(line.length).toBeLessThan(120)
    expect(line).toBe('Three stops.')
  })

  it('is deterministic', () => {
    const a = buildNarrative(three(), normaliseWindow(18, 23))
    const b = buildNarrative(three(), normaliseWindow(18, 23))
    expect(a.line).toBe(b.line)
  })
})
