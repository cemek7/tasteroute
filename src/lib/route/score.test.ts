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

  it('returns a finite number for a candidate missing every optional field', () => {
    const bare: Candidate = {
      id: 'bare',
      name: 'Bare',
      category: 'restaurant',
      primaryGenre: null,
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

describe('scoreCandidate with the weekday hours map Qloo actually returns', () => {
  const withHours = (hours: unknown): Candidate => ({ ...base('fx-nok'), hours })

  it('penalises a venue whose every open day ends before the window starts', () => {
    const daytimeOnly = withHours({
      monday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }],
      tuesday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }],
    })
    expect(scoreCandidate(base('fx-nok'), 'main', ctx())).toBeGreaterThan(
      scoreCandidate(daytimeOnly, 'main', ctx()),
    )
  })

  it('does not penalise a venue open during the window', () => {
    const evening = withHours({
      friday: [{ opens: 'T17:00:00', closed: false, closes: 'T23:30:00' }],
    })
    expect(scoreCandidate(evening, 'main', ctx())).toBe(
      scoreCandidate(base('fx-nok'), 'main', ctx()),
    )
  })

  it('treats a close time past midnight as spanning the window', () => {
    const lateNight = withHours({
      saturday: [{ opens: 'T20:00:00', closed: false, closes: 'T02:00:00' }],
    })
    expect(scoreCandidate(lateNight, 'main', ctx())).toBe(
      scoreCandidate(base('fx-nok'), 'main', ctx()),
    )
  })

  it('does not penalise when every day is marked closed with null times', () => {
    // Qloo returns this for places with no published hours; it is missing
    // data, not evidence the venue is shut.
    const noPublishedHours = withHours({
      friday: [{ opens: null, closed: true, closes: null }],
      monday: [{ opens: null, closed: true, closes: null }],
    })
    expect(scoreCandidate(noPublishedHours, 'main', ctx())).toBe(
      scoreCandidate(base('fx-nok'), 'main', ctx()),
    )
  })
})

describe('a stop across the city is not the same outing', () => {
  // A live Abuja plan put a 9.3km leg between its first two stops: the best
  // taste match for that phase simply sat on the other side of town. Zero
  // proximity credit was not enough to stop it, because the other 85% of the
  // weight still favoured it.
  const anchor = { lat: 9.0579, lng: 7.4951 }

  /** A candidate `metres` due north of the anchor. */
  const at = (metres: number, affinity: number): Candidate => ({
    ...base('fx-nok'),
    id: `at-${metres}`,
    affinity,
    lat: anchor.lat + metres / 111_320,
    lng: anchor.lng,
  })

  const c = ctx({ anchor })

  it('lets a decent match nearby beat a better one across the city', () => {
    const nearby = at(500, 0.75)
    const acrossTown = at(9_300, 0.9)
    expect(scoreCandidate(nearby, 'main', c)).toBeGreaterThan(
      scoreCandidate(acrossTown, 'main', c),
    )
  })

  it('keeps charging for distance past the walkable range', () => {
    // Both score zero for proximity, so without a penalty these tie.
    expect(scoreCandidate(at(5_000, 0.8), 'main', c)).toBeGreaterThan(
      scoreCandidate(at(9_300, 0.8), 'main', c),
    )
  })

  it('leaves a walkable candidate alone', () => {
    const inRange = at(1_200, 0.8)
    const noAnchor = scoreCandidate({ ...inRange }, 'main', ctx())
    // Still scored on taste, not pushed down: the penalty starts beyond the
    // range, and a 1.2km walk is a normal leg of a plan.
    expect(scoreCandidate(inRange, 'main', c)).toBeGreaterThan(noAnchor - 0.15)
  })

  it('starts the penalty gently, with no cliff at the threshold', () => {
    const justInside = scoreCandidate(at(3_990, 0.8), 'main', c)
    const justOutside = scoreCandidate(at(4_010, 0.8), 'main', c)
    expect(Math.abs(justInside - justOutside)).toBeLessThan(0.01)
  })

  it('does not treat a candidate with no coordinates as far away', () => {
    const unplaceable = { ...base('fx-nok'), lat: null, lng: null, affinity: 0.8 }
    expect(scoreCandidate(unplaceable, 'main', c)).toBeGreaterThan(
      scoreCandidate(at(9_300, 0.8), 'main', c),
    )
  })
})
