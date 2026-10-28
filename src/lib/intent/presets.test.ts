import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'
import { OCCASION_IDS, PARTY_COMPOSITIONS, VIBE_IDS } from './vocabulary'
import { phasesFor } from '../route/phases'
import { normaliseWindow } from '../route/window'

const phases = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!
  return phasesFor(normaliseWindow(p.startHour, p.endHour))
}

describe('PRESETS', () => {
  it('offers a distinct id and label for each', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    expect(new Set(PRESETS.map((p) => p.label)).size).toBe(PRESETS.length)
  })

  it('writes a mood the form would accept', () => {
    for (const p of PRESETS) {
      expect(p.mood.trim().length).toBeGreaterThan(0)
      expect(p.mood.length).toBeLessThanOrEqual(200)
    }
  })

  it('uses only vocabulary Qloo resolves, never an invented tag', () => {
    for (const p of PRESETS) {
      for (const v of p.intent.vibe ?? []) expect(VIBE_IDS).toContain(v)
      if (p.intent.occasion) expect(OCCASION_IDS).toContain(p.intent.occasion)
      const composition = p.intent.party?.composition
      if (composition) expect(PARTY_COMPOSITIONS).toContain(composition)
    }
  })

  it('picks hours that give the shape the label promises', () => {
    // A preset is a promise about the plan, so the hours have to produce it.
    expect(phases('day-out')).toContain('morning')
    expect(phases('day-out')).toContain('afternoon')
    expect(phases('big-night')).toContain('late')
    expect(phases('date-night')).toContain('main')
    expect(phases('food-crawl').length).toBeGreaterThanOrEqual(3)
  })

  it('keeps every window inside the hours the picker offers', () => {
    for (const p of PRESETS) {
      expect(p.startHour).toBeGreaterThanOrEqual(0)
      expect(p.startHour).toBeLessThanOrEqual(23)
      expect(p.endHour).toBeGreaterThanOrEqual(0)
      expect(p.endHour).toBeLessThanOrEqual(24)
    }
  })
})
