import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { CLOCK } from './phases'
import { kindOf, slotFit, slotsFor } from './slots'
import type { Candidate } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

describe('slotsFor', () => {
  it('puts a cafe in the open slot', () => {
    expect(slotsFor(byId('fx-cafe-neo'))).toContain('open')
  })

  it('puts a restaurant in the main slot', () => {
    expect(slotsFor(byId('fx-nok'))).toContain('main')
  })

  it('puts a cocktail bar in the close slot', () => {
    expect(slotsFor(byId('fx-bar-slate'))).toContain('close')
  })

  it('allows a bakery in the open slot', () => {
    expect(slotsFor(byId('fx-bakery-rise'))).toContain('open')
  })

  it('returns an empty array for a candidate with no recognisable tags', () => {
    const orphan: Candidate = {
      ...byId('fx-cafe-neo'),
      category: null,
      primaryGenre: null,
      tags: [],
    }
    expect(slotsFor(orphan)).toEqual([])
  })
})

describe('slotFit', () => {
  it('scores a cocktail bar higher for close than for main', () => {
    const c = byId('fx-bar-slate')
    expect(slotFit(c, 'close')).toBeGreaterThan(slotFit(c, 'main'))
  })

  it('returns zero for a slot the candidate is not eligible for', () => {
    expect(slotFit(byId('fx-cafe-neo'), 'close')).toBe(0)
  })

  it('never exceeds one', () => {
    for (const c of FIXTURE_CANDIDATES) {
      for (const s of ['open', 'main', 'close'] as const) {
        expect(slotFit(c, s)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('only going-out venues get a slot', () => {
  const withGenre = (id: string | null, category: string | null = null): Candidate => ({
    ...byId('fx-cafe-neo'),
    id: `g-${id}`,
    name: 'Somewhere',
    category,
    primaryGenre: id,
    tags: [],
  })

  it('refuses a housing complex at any affinity', () => {
    const estate = { ...withGenre('urn:tag:genre:place:housing_complex'), affinity: 0.99 }
    expect(slotsFor(estate)).toEqual([])
  })

  it('refuses car parks, offices and shops', () => {
    for (const id of [
      'urn:tag:genre:place:car_park',
      'urn:tag:genre:place:office',
      'urn:tag:genre:place:hardware_store',
      'urn:tag:genre:place:supermarket',
    ]) {
      expect(slotsFor(withGenre(id)), id).toEqual([])
    }
  })

  it('accepts the going-out kinds', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:cafe'))).toContain('open')
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant'))).toEqual(['main'])
    expect(slotsFor(withGenre('urn:tag:genre:place:bar:cocktail_bar'))).toContain('close')
  })

  it('still reads a nested barbecue genre as dinner', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant:barbecue'))).toEqual(['main'])
  })

  it('falls back to category and tags when primary_genre is absent', () => {
    expect(slotsFor(withGenre(null, 'cafe'))).toContain('open')
  })
})

describe('venue kinds, against the genres Qloo actually publishes', () => {
  const withGenre = (id: string | null, category: string | null = null): Candidate => ({
    ...byId('fx-cafe-neo'),
    id: `k-${id}`,
    name: 'Somewhere',
    category,
    primaryGenre: id,
    tags: [],
  })

  it('reads a night club as a club, which only the late phase takes', () => {
    const c = withGenre('urn:tag:genre:place:night_club')
    expect(kindOf(c)?.kind).toBe('club')
    expect(slotsFor(c)).toContain('late')
    expect(slotsFor(c)).not.toContain('main')
  })

  it('reads a bare club and a dancing venue as clubs too', () => {
    expect(kindOf(withGenre('urn:tag:genre:place:club'))?.kind).toBe('club')
    expect(kindOf(withGenre('urn:tag:genre:place:dancing'))?.kind).toBe('club')
  })

  // These are real Qloo genres, not hypotheticals: a search for "club"
  // returns sports_club and soccer_club. They are places worth planning
  // around, so they are kept — but never as nightlife. Taking them out
  // altogether was the wrong fix for that.
  it('keeps the clubs that are not nightlife, and keeps them out of the night', () => {
    for (const id of ['sports_club', 'soccer_club', 'golf_club', 'health_club']) {
      const slots = slotsFor(withGenre(`urn:tag:genre:place:${id}`))
      expect(slots.length, id).toBeGreaterThan(0)
      expect(slots, id).not.toContain('late')
      expect(slots, id).not.toContain('close')
    }
  })

  it('refuses a park and ride, which a search for parks returns', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:park_ride'))).toEqual([])
  })

  it('refuses a market researcher, which a search for markets returns', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:market_researcher'))).toEqual([])
  })

  it('takes a park, a museum and a market as daytime things to do', () => {
    for (const id of ['park', 'museum', 'market']) {
      const slots = slotsFor(withGenre(`urn:tag:genre:place:${id}`))
      expect(slots, id).toContain('activity')
    }
  })

  it('lets a cafe serve the morning or the start of an evening', () => {
    const slots = slotsFor(withGenre('urn:tag:genre:place:cafe'))
    expect(slots).toContain('morning')
    expect(slots).toContain('open')
  })

  it('keeps a restaurant out of the late phase', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant'))).not.toContain('late')
  })

  it('still reads a nested night club under restaurant as a club', () => {
    expect(kindOf(withGenre('urn:tag:genre:place:restaurant:night_club'))?.kind).toBe('club')
  })

  it('never scores a fit above one, for every phase', () => {
    for (const c of FIXTURE_CANDIDATES) {
      for (const s of CLOCK) expect(slotFit(c, s)).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * Measured against the live host: an unfiltered Lagos pool of 50 came back
 * with 36 places that matched no kind. Most of that is correct — hotels,
 * malls, computer stores, a university, an airport — but nature preserves,
 * cultural centres and event venues are real places to spend an afternoon
 * and were being thrown away with them.
 */
describe('the daytime genres a real Lagos pool turned up', () => {
  const withGenre = (id: string): Candidate => ({
    ...byId('fx-cafe-neo'),
    id: `d-${id}`,
    name: 'Somewhere',
    category: null,
    primaryGenre: `urn:tag:genre:place:${id}`,
    tags: [],
  })

  it('takes the places a day out actually goes', () => {
    for (const id of [
      'nature_preserve',
      'cultural_center',
      'concert_hall',
      'amusement_park',
      'amusement_center',
    ]) {
      expect(slotsFor(withGenre(id)).length, id).toBeGreaterThan(0)
    }
  })

  // Every one of these is a real sibling the live tag search returns next to
  // the genre above it, and each shares a word with it.
  it('refuses the siblings that share a word but not a purpose', () => {
    for (const id of [
      'hunting_preserve',
      'fitness_center',
      'wedding_venue',
      'city_hall',
      'amusement_park_ride',
      'banquet_hall',
      // `event_venue` covers concert halls and wedding halls alike, and
      // nothing in the data separates them. A live pool offered "The Canyon
      // Lekki Halls & Event Centre" as an afternoon out, so the genre is
      // refused rather than guessed at.
      'event_venue',
    ]) {
      expect(slotsFor(withGenre(id)), id).toEqual([])
    }
  })
})

/**
 * Sports venues are places people plan an outing around — a match, a round
 * of golf, an afternoon at the club. The earlier build refused them, which
 * was the wrong fix for a real problem: `sports_club` and `soccer_club`
 * share a word with `club`, so they were being offered as the last drink of
 * the night. They get their own kind instead, matched before nightlife.
 *
 * Every genre below was confirmed against the live host.
 */
describe('sports and leisure venues are their own kind, not nightlife', () => {
  const withGenre = (id: string): Candidate => ({
    ...byId('fx-cafe-neo'),
    id: `s-${id}`,
    name: 'Somewhere',
    category: null,
    primaryGenre: `urn:tag:genre:place:${id}`,
    tags: [],
  })

  it('reads them as sports', () => {
    for (const id of [
      'sports_club',
      'soccer_club',
      'sports_complex',
      'stadium',
      'golf',
      'golf_course',
      'golf_club',
      'tennis',
      'tennis_court',
      'tennis_club',
      'yacht_club',
      'country_club',
      'gymnastics_club',
    ]) {
      expect(kindOf(withGenre(id))?.kind, id).toBe('sports')
    }
  })

  it('offers them in the daytime phases', () => {
    for (const id of ['sports_club', 'soccer_club', 'stadium', 'golf_course']) {
      const slots = slotsFor(withGenre(id))
      expect(slots, id).toContain('activity')
      expect(slots, id).toContain('afternoon')
    }
  })

  it('never offers them as a drink or a club night', () => {
    for (const id of ['sports_club', 'soccer_club', 'stadium', 'yacht_club']) {
      const slots = slotsFor(withGenre(id))
      expect(slots, id).not.toContain('close')
      expect(slots, id).not.toContain('late')
      expect(slots, id).not.toContain('main')
    }
  })

  it('still reads a sports bar as a bar, because that is what it is', () => {
    expect(kindOf(withGenre('bar:sports_bar'))?.kind).toBe('bar')
    expect(slotsFor(withGenre('bar:sports_bar'))).toContain('close')
  })

  it('still reads a night club as a club', () => {
    expect(kindOf(withGenre('night_club'))?.kind).toBe('club')
    expect(kindOf(withGenre('club'))?.kind).toBe('club')
  })

  // Real siblings the live tag search returns beside the venues above.
  it('refuses the shops and services that share their words', () => {
    for (const id of ['tennis_store', 'sports_massage_therapist', 'tennis_shop']) {
      expect(slotsFor(withGenre(id)), id).toEqual([])
    }
  })
})
