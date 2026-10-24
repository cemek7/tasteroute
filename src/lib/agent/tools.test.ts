import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { createSession } from './tools'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Lagos',
  mood: 'low-key but not dead',
  timeWindow: { startHour: 18, endHour: 23 }, intent: {},
}

const session = () =>
  createSession({
    provider: new FixtureProvider(),
    request,
    locality: { name: 'Lagos' },
  })

describe('createSession', () => {
  it('exposes exactly the four tools the agent may call', () => {
    const names = session().tools.map((t) => t.function.name).sort()
    expect(names).toEqual(['finalize_route', 'find_tags', 'seed_entities', 'suggest_places'])
  })

  it('gives no tool a parameter that would let the model choose the stops', () => {
    // Assert on the parameter schemas, not the descriptions: a description is
    // allowed to say "TasteRoute orders the stops, you do not".
    const params = JSON.stringify(session().tools.map((t) => t.function.parameters))
    for (const forbidden of ['candidateIds', 'stops', 'order', 'route', 'why']) {
      expect(params).not.toContain(forbidden)
    }
  })

  it('returns tags from find_tags', async () => {
    const s = session()
    const out = (await s.dispatch('find_tags', { query: 'cocktail' })) as { tags: unknown[] }
    expect(out.tags.length).toBeGreaterThan(0)
  })

  it('accumulates candidates into the pool across suggest_places calls', async () => {
    const s = session()
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    const afterFirst = s.pool.length
    await s.dispatch('suggest_places', {
      tagIds: ['urn:tag:genre:place:restaurant:cocktail_bar'],
    })
    expect(s.pool.length).toBeGreaterThan(afterFirst)
  })

  it('deduplicates candidates already in the pool', async () => {
    const s = session()
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    const afterFirst = s.pool.length
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    expect(s.pool.length).toBe(afterFirst)
  })

  it('returns an assessment with suggest_places so the agent can decide to widen', async () => {
    const s = session()
    const out = (await s.dispatch('suggest_places', {
      tagIds: ['urn:tag:genre:place:cafe'],
    })) as { assessment: { confidence: string; reason: string } }
    expect(['strong', 'ok', 'weak']).toContain(out.assessment.confidence)
    expect(out.assessment.reason).toBeTruthy()
  })

  it('builds a route from the accumulated pool on finalize_route', async () => {
    const s = session()
    await s.dispatch('suggest_places', {})
    const out = (await s.dispatch('finalize_route', {})) as { ok: boolean }
    expect(out.ok).toBe(true)
    expect(s.finalRoute?.stops).toHaveLength(3)
  })

  it('reports the unfilled slot instead of throwing when the pool is too thin', async () => {
    const s = session()
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    const out = (await s.dispatch('finalize_route', {})) as {
      ok: boolean
      unfilledSlots?: string[]
    }
    expect(out.ok).toBe(false)
    expect(out.unfilledSlots).toContain('close')
  })

  it('records a trace entry per dispatch without leaking the api key', async () => {
    const s = session()
    await s.dispatch('find_tags', { query: 'cocktail' })
    expect(s.trace).toHaveLength(1)
    expect(s.trace[0].tool).toBe('find_tags')
    expect(JSON.stringify(s.trace)).not.toMatch(/hack_[0-9a-f]/)
  })

  it('remembers seeded entity names so reasons can cite them', async () => {
    const s = session()
    await s.dispatch('seed_entities', { names: ['Terrace Nine'] })
    await s.dispatch('suggest_places', { entityIds: ['fx-nok'] })
    const out = (await s.dispatch('finalize_route', {})) as {
      ok: boolean
      stops?: { why: string }[]
    }
    expect(out.ok).toBe(true)
    expect(out.stops?.some((st) => st.why.includes('Terrace Nine Kitchen'))).toBe(true)
  })

  it('rejects an unknown tool name', async () => {
    await expect(session().dispatch('rm_rf', {})).rejects.toThrow(/unknown tool/i)
  })

  it('tells the agent to search first when finalize_route is called on an empty pool', async () => {
    const s = session()
    const out = (await s.dispatch('finalize_route', {})) as {
      ok: boolean
      reason?: string
      hint?: string
    }
    expect(out.ok).toBe(false)
    expect(out.hint).toMatch(/suggest_places/)
  })
})
