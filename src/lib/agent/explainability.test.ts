import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { createSession } from './tools'
import type { Route, RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Lagos',
  mood: 'anything',
  timeWindow: { startHour: 18, endHour: 23 }, intent: {},
}

const session = () =>
  createSession({
    provider: new FixtureProvider(),
    request,
    locality: { name: 'Lagos' },
  })

describe('Qloo explainability stays attached to the query that produced it', () => {
  it('does not claim Qloo linked a place that came from an unseeded query', async () => {
    const s = session()
    await s.dispatch('seed_entities', { names: ['Terrace Nine'] })
    // Seeded query: explainability is real for these candidates.
    await s.dispatch('suggest_places', {
      entityIds: ['fx-nok'],
      tagIds: ['urn:tag:offerings:place:cocktails'],
    })
    // Unseeded queries: Qloo returned no explainability for these at all.
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:restaurant'] })
    await s.dispatch('finalize_route', {})

    const route = s.finalRoute as Route
    expect(route).toBeTruthy()

    const cafe = route.stops.find((st) => st.candidate.id === 'fx-cafe-neo')
    expect(cafe).toBeTruthy()
    expect(cafe?.why).not.toContain('Qloo links this to')
    expect(cafe?.evidence.some((e) => e.kind === 'explainability')).toBe(false)
  })

  it('never recommends a place on the grounds that Qloo links it to itself', async () => {
    const s = session()
    await s.dispatch('seed_entities', { names: ['Terrace Nine'] })
    await s.dispatch('suggest_places', { entityIds: ['fx-nok'] })
    await s.dispatch('finalize_route', {})

    const route = s.finalRoute as Route
    const seeded = route.stops.find((st) => st.candidate.id === 'fx-nok')
    expect(seeded).toBeTruthy()
    expect(seeded?.why).not.toContain('Qloo links this to Terrace Nine Kitchen')
  })

  it('still cites explainability for a candidate the seeded query did return', async () => {
    const s = session()
    await s.dispatch('seed_entities', { names: ['Terrace Nine'] })
    // Untagged seeded query: Qloo returns the whole page, and its top three
    // are genuinely explained by the seed.
    await s.dispatch('suggest_places', { entityIds: ['fx-nok'] })
    await s.dispatch('finalize_route', {})

    const route = s.finalRoute as Route
    expect(route).toBeTruthy()
    const explained = route.stops.filter((st) =>
      st.evidence.some((e) => e.kind === 'explainability'),
    )
    expect(explained.length).toBeGreaterThan(0)
    for (const st of explained) {
      expect(st.why).toContain('Qloo links this to Terrace Nine Kitchen')
      expect(st.candidate.id).not.toBe('fx-nok')
    }
  })

  it('does not label backfilled candidates with an earlier query explainability', async () => {
    const s = session()
    await s.dispatch('seed_entities', { names: ['Terrace Nine'] })
    // The seeded query returns only the cocktail bar, so the cafe and the
    // restaurant in the finished route both arrive via backfill.
    await s.dispatch('suggest_places', {
      entityIds: ['fx-nok'],
      tagIds: ['urn:tag:offerings:place:cocktails'],
    })
    await s.backfillSlots(['open', 'main'])
    await s.dispatch('finalize_route', {})

    const route = s.finalRoute as Route
    expect(route).toBeTruthy()
    for (const slot of ['open', 'main'] as const) {
      const stop = route.stops.find((st) => st.slot === slot)
      expect(stop?.why).not.toContain('Qloo links this to')
    }
  })
})
