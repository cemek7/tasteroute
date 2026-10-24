import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { resolvePreferenceTags } from './tools'
import type { TasteProvider } from '../providers/types'

describe('resolvePreferenceTags', () => {
  const provider = new FixtureProvider()

  it('resolves nothing when no preferences were given', async () => {
    const r = await resolvePreferenceTags(provider, {})
    expect(r.tagIds).toEqual([])
    expect(r.applied).toEqual([])
  })

  it('resolves a vibe by querying Qloo rather than from a table', async () => {
    const r = await resolvePreferenceTags(provider, { vibe: ['lively'] })
    expect(r.tagIds.length).toBeGreaterThan(0)
    expect(r.applied.some((a) => a.label === 'Vibe')).toBe(true)
  })

  it('resolves an occasion and a party composition together', async () => {
    const r = await resolvePreferenceTags(provider, {
      occasion: 'catching_up',
      party: { size: 6, composition: 'friends' },
    })
    expect(r.applied.map((a) => a.label).sort()).toContain('Occasion')
  })

  it('deduplicates when two preferences resolve to the same tag', async () => {
    const r = await resolvePreferenceTags(provider, {
      occasion: 'catching_up',
      party: { size: 6, composition: 'friends' },
    })
    expect(new Set(r.tagIds).size).toBe(r.tagIds.length)
  })

  it('reports nothing for a preference Qloo had no tag for', async () => {
    const empty: TasteProvider = {
      kind: 'fixture',
      async findTags() {
        return []
      },
      seedEntities: provider.seedEntities.bind(provider),
      suggestPlaces: provider.suggestPlaces.bind(provider),
    }
    const r = await resolvePreferenceTags(empty, { vibe: ['lively'] })
    expect(r.tagIds).toEqual([])
    expect(r.applied).toEqual([])
  })

  it('names the party size in what it reports', async () => {
    const r = await resolvePreferenceTags(provider, {
      party: { size: 4, composition: 'friends' },
    })
    const going = r.applied.find((a) => a.label === 'Going with')
    expect(going?.detail).toContain('4')
  })
})

describe('demographics stay out of everything a person can see', () => {
  it('never appears in the intent echo', async () => {
    const { constraintsFromIntent } = await import('../intent/qloo-params')
    const { applied } = constraintsFromIntent({
      demographics: { ageBand: '25_to_29', gender: 'female' },
    })
    expect(JSON.stringify(applied)).not.toMatch(/25_to_29|female/i)
  })

  it('still reaches Qloo as a signal', async () => {
    const { constraintsFromIntent } = await import('../intent/qloo-params')
    const { constraints } = constraintsFromIntent({
      demographics: { ageBand: '25_to_29', gender: 'female' },
    })
    expect(constraints.demographics).toEqual({ ageBand: '25_to_29', gender: 'female' })
  })

  it('never appears in the trace', async () => {
    const { planRoute } = await import('./loop')
    const result = await planRoute({
      provider: new FixtureProvider(),
      request: {
        city: 'Lagos',
        mood: 'x',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: { demographics: { ageBand: '25_to_29', gender: 'female' } },
      },
      locality: { name: 'Lagos' },
      client: {
        async complete() {
          return { toolCalls: [] }
        },
      },
      maxRounds: 2,
      constraints: { demographics: { ageBand: '25_to_29', gender: 'female' } },
    })
    if ('error' in result) throw new Error(result.error)
    expect(JSON.stringify(result.route.trace)).not.toMatch(/25_to_29|female/i)
  })
})

describe('what the preferences did is reported back', () => {
  it('puts the resolved preference labels on the route echo', async () => {
    const { planRoute } = await import('./loop')
    const result = await planRoute({
      provider: new FixtureProvider(),
      request: {
        city: 'Lagos',
        mood: 'dinner',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: {
          vibe: ['quiet'],
          occasion: 'first_date',
          party: { size: 2, composition: 'couple' },
        },
      },
      locality: { name: 'Lagos' },
      client: {
        async complete() {
          return { toolCalls: [] }
        },
      },
      maxRounds: 3,
    })
    if ('error' in result) throw new Error(result.error)
    const labels = result.route.intentEcho.applied.map((a) => a.label)
    expect(labels).toContain('Vibe')
    expect(labels).toContain('Occasion')
    expect(labels).toContain('Going with')
  })
})

describe('places you already like reach Qloo as entity signals', () => {
  it('seeds the search with them, which is the only path to explainability', async () => {
    const { planRoute } = await import('./loop')
    const seen: { entities?: string[] }[] = []
    const watcher = {
      kind: 'qloo' as const,
      async findTags() {
        return []
      },
      async seedEntities(names: string[]) {
        return names.map((n) => ({ entityId: `e-${n}`, name: n }))
      },
      async suggestPlaces(q: { entities?: string[] }) {
        seen.push({ entities: q.entities })
        const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
        return {
          candidates: FIXTURE_CANDIDATES,
          explainability: (q.entities ?? []).length
            ? {
                signalEntities: [
                  {
                    entityId: q.entities![0],
                    avgScore: 1,
                    topN: 3 as const,
                    appliesTo: FIXTURE_CANDIDATES.slice(0, 3).map((c) => c.id),
                  },
                ],
              }
            : null,
          warnings: [],
        }
      },
    }

    const result = await planRoute({
      provider: watcher,
      request: {
        city: 'Abuja',
        mood: 'dinner',
        timeWindow: { startHour: 19, endHour: 23 },
        intent: { seedPlaces: ['Jazzhole'] },
      },
      locality: { name: 'Abuja' },
      client: {
        async complete() {
          return { toolCalls: [] }
        },
      },
      maxRounds: 3,
    })
    if ('error' in result) throw new Error(result.error)

    // The named place became an entity signal.
    expect(seen.some((q) => (q.entities ?? []).includes('e-Jazzhole'))).toBe(true)
    // And that is what lets a stop cite Qloo's own explainability.
    expect(
      result.route.stops.some((s) => s.evidence.some((e) => e.kind === 'explainability')),
    ).toBe(true)
  })

  it('reports a named place Qloo could not find', async () => {
    const { planRoute } = await import('./loop')
    const blind = {
      kind: 'qloo' as const,
      async findTags() {
        return []
      },
      async seedEntities() {
        return []
      },
      async suggestPlaces() {
        const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
        return { candidates: FIXTURE_CANDIDATES, explainability: null, warnings: [] }
      },
    }
    const result = await planRoute({
      provider: blind,
      request: {
        city: 'Abuja',
        mood: 'dinner',
        timeWindow: { startHour: 19, endHour: 23 },
        intent: { seedPlaces: ['Somewhere Imaginary'] },
      },
      locality: { name: 'Abuja' },
      client: {
        async complete() {
          return { toolCalls: [] }
        },
      },
      maxRounds: 3,
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.ignored.some((i) => i.reason.includes('Somewhere Imaginary'))).toBe(true)
  })
})
