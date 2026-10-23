import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { scoreCandidate, type ScoreContext } from './score'
import type { Candidate } from '../providers/types'

const base = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  requestedTagIds: [],
  timeWindow: { startHour: 18, endHour: 23 },
  usedCategories: [],
  ...over,
})

describe('scoreCandidate', () => {
  it('rises with affinity, all else equal', () => {
    const low = { ...base('fx-nok'), affinity: 0.2 }
    const high = { ...base('fx-nok'), affinity: 0.9 }
    expect(scoreCandidate(high, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(low, 'main', ctx()),
    )
  })

  it('prefers a candidate matching more of the requested tags', () => {
    const requestedTagIds = [
      'urn:tag:genre:place:restaurant:cocktail_bar',
      'urn:tag:offerings:place:cocktails',
    ]
    const both = base('fx-bar-slate')
    const one = base('fx-bar-afterglow')
    const c = ctx({ requestedTagIds })
    expect(scoreCandidate(both, 'close', c)).toBeGreaterThan(
      scoreCandidate(one, 'close', c),
    )
  })

  it('penalises a closed venue heavily', () => {
    const open = { ...base('fx-closed-kitchen'), isClosed: false }
    const closed = base('fx-closed-kitchen')
    expect(scoreCandidate(open, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(closed, 'main', ctx()) + 0.4,
    )
  })

  it('penalises a category already used by a chosen stop', () => {
    const c = base('fx-yellow-chair')
    expect(scoreCandidate(c, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(c, 'main', ctx({ usedCategories: ['restaurant'] })),
    )
  })

  it('does not rank a null-affinity candidate below an equivalent zero-affinity one', () => {
    const nullAff = { ...base('fx-nok'), affinity: null }
    const zeroAff = { ...base('fx-nok'), affinity: 0 }
    expect(scoreCandidate(nullAff, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(zeroAff, 'main', ctx()),
    )
  })

  it('is deterministic across repeated calls', () => {
    const c = base('fx-bar-slate')
    const runs = Array.from({ length: 5 }, () => scoreCandidate(c, 'close', ctx()))
    expect(new Set(runs).size).toBe(1)
  })

  it('penalises a venue shut for the whole requested window', () => {
    const c = { ...base('fx-nok'), hours: { openHour: 7, closeHour: 15 } }
    expect(scoreCandidate(base('fx-nok'), 'main', ctx())).toBeGreaterThan(
      scoreCandidate(c, 'main', ctx()),
    )
  })

  it('returns a finite number for a candidate missing every optional field', () => {
    const bare: Candidate = {
      id: 'bare',
      name: 'Bare',
      category: 'restaurant',
      lat: null,
      lng: null,
      address: null,
      affinity: null,
      popularity: null,
      isClosed: null,
      hours: null,
      tags: [],
      descriptors: {},
      providerRank: 1,
      providerRef: { provider: 'fixture', entityId: 'bare' },
    }
    expect(Number.isFinite(scoreCandidate(bare, 'main', ctx()))).toBe(true)
  })
})
