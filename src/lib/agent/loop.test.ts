import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES, FixtureProvider } from '../providers/fixture'
import { planRoute, type ChatClient } from './loop'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Lagos',
  mood: 'low-key but not dead',
  timeWindow: { startHour: 18, endHour: 23 }, intent: {},
}

/** Replays a fixed script of assistant turns, ignoring the messages sent. */
const scriptedClient = (
  script: { calls: { name: string; args: object }[] }[],
): ChatClient => {
  let turn = 0
  return {
    async complete() {
      const step = script[turn++]
      if (!step) return { toolCalls: [] }
      return {
        toolCalls: step.calls.map((c, i) => ({
          id: `call_${turn}_${i}`,
          name: c.name,
          arguments: JSON.stringify(c.args),
        })),
      }
    },
  }
}

const run = (client: ChatClient, maxRounds = 6) =>
  planRoute({
    provider: new FixtureProvider(),
    request,
    locality: { name: 'Lagos' },
    client,
    maxRounds,
  })

describe('planRoute', () => {
  it('returns a route when the agent gathers then finalizes', async () => {
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.roundsUsed).toBe(2)
  })

  it('force-finalizes when the budget runs out', async () => {
    const neverFinalizes = scriptedClient(
      Array.from({ length: 10 }, () => ({ calls: [{ name: 'suggest_places', args: {} }] })),
    )
    const result = await run(neverFinalizes, 2)
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.roundsUsed).toBe(2)
  })

  it('force-finalizes when the model stops calling tools without finalizing', async () => {
    const result = await run(
      scriptedClient([{ calls: [{ name: 'suggest_places', args: {} }] }]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
  })

  it('names the slot it could not fill when even backfill finds nothing', async () => {
    // A city where Qloo only knows cafes. Backfill cannot invent a restaurant,
    // so the user is told which part of the evening failed.
    const cafesOnly = {
      kind: 'qloo' as const,
      async findTags(query: string) {
        return query.includes('cafe')
          ? [
              {
                id: 'urn:tag:genre:place:cafe',
                name: 'Cafe',
                type: 'urn:tag:genre:place',
                popularity: 1,
              },
            ]
          : []
      },
      async seedEntities() {
        return []
      },
      async suggestPlaces() {
        return {
          candidates: FIXTURE_CANDIDATES.filter((c) => c.category === 'cafe'),
          explainability: null,
          warnings: [],
        }
      },
    }

    const result = await planRoute({
      provider: cafesOnly,
      request,
      locality: { name: 'Cafeville' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 3,
    })

    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toMatch(/main|close/)
    expect(result.trace.length).toBeGreaterThan(0)
  })

  it('surfaces the unknown-city message when the provider rejects the locality', async () => {
    const { UnknownLocalityError } = await import('../providers/qloo')
    const failing = {
      kind: 'qloo' as const,
      async findTags() {
        return []
      },
      async seedEntities() {
        return []
      },
      async suggestPlaces(): Promise<never> {
        throw new UnknownLocalityError('Nowhereville')
      },
    }
    const result = await planRoute({
      provider: failing,
      request: { ...request, city: 'Nowhereville' },
      locality: { name: 'Nowhereville' },
      client: scriptedClient([{ calls: [{ name: 'suggest_places', args: {} }] }]),
      maxRounds: 3,
    })
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toContain('Nowhereville')
  })

  it('reports a model outage as a readable error instead of throwing', async () => {
    const broken: ChatClient = {
      async complete() {
        throw new Error('402 insufficient credit')
      },
    }
    const result = await run(broken)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toBe('The planner has run out of credit for now. Try again later.')
  })

  it('does not hand a raw Zod dump to the user', async () => {
    const zodish: ChatClient = {
      async complete() {
        throw new Error(
          'ZodError: [\n  {\n    "expected": "string",\n    "code": "invalid_type"\n  }\n]',
        )
      },
    }
    const result = await run(zodish)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).not.toContain('invalid_type')
    expect(result.error).not.toContain('\n')
    expect(result.error).toBe(
      'Qloo returned something TasteRoute could not read. Try again in a moment.',
    )
  })

  it('does not tell the user an api key is wrong in provider wording', async () => {
    const unauthorised: ChatClient = {
      async complete() {
        throw new Error('401 Incorrect API key provided: sk-or-v1-abc')
      },
    }
    const result = await run(unauthorised)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).not.toContain('sk-or-v1')
    expect(result.error).toContain('not configured correctly')
  })

  it('attaches the trace to the returned route', async () => {
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'find_tags', args: { query: 'cocktail' } }] },
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.trace.map((t) => t.tool)).toEqual([
      'find_tags',
      'suggest_places',
      'finalize_route',
    ])
  })

  it('keeps an unknown tool name from aborting the run', async () => {
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'rm_rf', args: {} }] },
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
  })

  it('records the assistant turn with its tool_calls before the tool results', async () => {
    // OpenAI's wire format requires every tool message to follow an assistant
    // message carrying the matching tool_call id. Sending tool results without
    // it is a 400 from the provider.
    const seen: { role: string; toolCallId?: string; toolCalls?: { id: string }[] }[][] = []
    const client: ChatClient = {
      async complete({ messages }) {
        seen.push(messages.map((m) => ({ ...m })))
        if (seen.length === 1) {
          return { toolCalls: [{ id: 'call_a', name: 'suggest_places', arguments: '{}' }] }
        }
        return { toolCalls: [{ id: 'call_b', name: 'finalize_route', arguments: '{}' }] }
      },
    }

    const result = await run(client)
    if ('error' in result) throw new Error(result.error)

    const secondTurn = seen[1]
    const toolIndex = secondTurn.findIndex((m) => m.role === 'tool')
    expect(toolIndex).toBeGreaterThan(0)

    const before = secondTurn[toolIndex - 1]
    expect(before.role).toBe('assistant')
    expect(before.toolCalls?.map((c) => c.id)).toContain('call_a')
    expect(secondTurn[toolIndex].toolCallId).toBe('call_a')
  })

  it('still returns a route when the model never calls suggest_places', async () => {
    // Observed against the live model: it resolved tags, then jumped straight
    // to finalize_route with an empty pool. The loop must rescue that rather
    // than hand the user an error.
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'find_tags', args: { query: 'cocktail' } }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.route.trace.some((t) => t.tool === 'suggest_places')).toBe(true)
  })

  it('nudges the model to search once it has spent two rounds without searching', async () => {
    // Observed live: the model called find_tags four times and never searched,
    // burning the budget. After two tag-only rounds it gets told to search.
    const seen: string[][] = []
    const client: ChatClient = {
      async complete({ messages }) {
        seen.push(messages.filter((m) => m.role === 'user').map((m) => m.content))
        const n = seen.length
        if (n <= 3) {
          return {
            toolCalls: [{ id: `c${n}`, name: 'find_tags', arguments: '{"query":"x"}' }],
          }
        }
        return { toolCalls: [{ id: 'cf', name: 'finalize_route', arguments: '{}' }] }
      },
    }
    await run(client)
    const lastTurnUserMessages = seen.at(-1) ?? []
    expect(lastTurnUserMessages.some((c) => /suggest_places/.test(c))).toBe(true)
  })

  it('retries a transient model connection error once before giving up', async () => {
    let attempts = 0
    const flaky: ChatClient = {
      async complete() {
        attempts += 1
        if (attempts === 1) throw new Error('Connection error.')
        return { toolCalls: [{ id: 'c1', name: 'suggest_places', arguments: '{}' }] }
      },
    }
    const result = await run(flaky, 2)
    expect(attempts).toBeGreaterThanOrEqual(2)
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
  })

  it('gives up with an error when the model fails twice in a row', async () => {
    const dead: ChatClient = {
      async complete() {
        throw new Error('Connection error.')
      },
    }
    const result = await run(dead, 2)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toContain('Connection error')
  })

  it('backfills a slot the model never searched for and still returns a route', async () => {
    // Observed live: the model searched only its mood tags, which returned
    // bars and restaurants but no cafes, so the open slot could not be filled.
    // Slot coverage is TasteRoute's responsibility, not the model's.
    const result = await run(
      scriptedClient([
        {
          calls: [
            {
              name: 'suggest_places',
              args: { tagIds: ['urn:tag:genre:place:restaurant:cocktail_bar'] },
            },
          ],
        },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.route.stops.map((s) => s.slot).sort()).toEqual(['close', 'main', 'open'])
    expect(result.route.trace.some((t) => t.tool === 'backfill_slots')).toBe(true)
  })
})

describe('conflicting intent relaxes rather than refusing', () => {
  it('drops the softest constraint and says so when nothing matches', async () => {
    const result = await planRoute({
      provider: new FixtureProvider(),
      request,
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
      // No fixture is this obscure, so the first search comes back empty.
      constraints: { popularityMax: 0.01, priceLevelMax: 2 },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.ignored.map((i) => i.label)).toContain('Hidden gems')
  })

  it('reports nothing ignored when the constraints were satisfiable', async () => {
    const result = await planRoute({
      provider: new FixtureProvider(),
      request,
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.ignored).toEqual([])
  })

  it('resolves a city centre before searching with a radius', async () => {
    const seen: unknown[] = []
    const watcher = {
      kind: 'qloo' as const,
      async findTags() {
        return []
      },
      async seedEntities() {
        return []
      },
      async suggestPlaces(q: { constraints?: { radius?: { lat: number } } }) {
        seen.push(q.constraints?.radius)
        const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
        return { candidates: FIXTURE_CANDIDATES, explainability: null, warnings: [] }
      },
    }
    await planRoute({
      provider: watcher,
      request,
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 3,
      constraints: { radius: { lat: 0, lng: 0, metres: 2000 } },
    })
    // The placeholder 0,0 must never reach a real search.
    const used = seen.filter((r): r is { lat: number } => !!r)
    expect(used.length).toBeGreaterThan(0)
    expect(used.every((r) => r.lat !== 0)).toBe(true)
  })
})

describe('a dropped requirement lowers confidence on the real path', () => {
  const halalOnly = {
    kind: 'qloo' as const,
    async findTags() {
      return []
    },
    async seedEntities() {
      return []
    },
    async suggestPlaces(q: { constraints?: { requiredTags?: string[] } }) {
      const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
      // Nothing in this city carries the required tag.
      const empty = (q.constraints?.requiredTags ?? []).length > 0
      return {
        candidates: empty ? [] : FIXTURE_CANDIDATES,
        explainability: null,
        warnings: [],
      }
    },
  }

  it('returns weak confidence when a must-have had to be relaxed', async () => {
    const result = await planRoute({
      provider: halalOnly,
      request,
      locality: { name: 'Abuja' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
      constraints: { requiredTags: ['urn:tag:dietary_option:qloo:halal'] },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.ignored.map((i) => i.label)).toContain('Must-haves')
    expect(result.route.confidence).toBe('weak')
  })

  it('leaves confidence alone when only a soft constraint was relaxed', async () => {
    const result = await planRoute({
      provider: new FixtureProvider(),
      request,
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
      constraints: { popularityMax: 0.01 },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.ignored.map((i) => i.label)).toContain('Hidden gems')
    expect(result.route.confidence).not.toBe('weak')
  })
})

describe('a slot-coverage failure is not a reason to drop a requirement', () => {
  /** Honours requiredTags, but only ever returns restaurants. */
  const restaurantsOnlyHalal = {
    kind: 'qloo' as const,
    async findTags(query: string) {
      return query.includes('cafe') || query.includes('coffee')
        ? [
            {
              id: 'urn:tag:genre:place:cafe',
              name: 'Cafe',
              type: 'urn:tag:genre:place',
              popularity: 1,
            },
          ]
        : query.includes('bar')
          ? [
              {
                id: 'urn:tag:genre:place:cocktail_bar',
                name: 'Cocktail Bar',
                type: 'urn:tag:genre:place',
                popularity: 1,
              },
            ]
          : []
    },
    async seedEntities() {
      return []
    },
    async suggestPlaces(q: {
      tags?: { id: string }[]
      constraints?: { requiredTags?: string[] }
    }) {
      const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
      // Every candidate conforms to the requirement; the pool is simply
      // short of a cafe and a bar until something searches for them.
      const asked = (q.tags ?? []).map((t) => t.id).join(' ')
      const kinds = asked.includes('cafe')
        ? ['cafe']
        : asked.includes('bar')
          ? ['cocktail_bar']
          : ['restaurant']
      return {
        candidates: FIXTURE_CANDIDATES.filter((c) => kinds.includes(c.category ?? '')),
        explainability: null,
        warnings: [],
      }
    },
  }

  it('backfills the missing slots instead of giving up the requirement', async () => {
    const result = await planRoute({
      provider: restaurantsOnlyHalal,
      request,
      locality: { name: 'Abuja' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
      constraints: { requiredTags: ['urn:tag:dietary_option:qloo:halal'] },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    // The pool was never empty with the requirement applied, so there was
    // never a reason to drop it.
    expect(result.ignored.map((i) => i.label)).not.toContain('Must-haves')
    expect(result.route.confidence).not.toBe('weak')
  })

  it('still drops a requirement when the pool really is empty with it applied', async () => {
    const nothingConforms = {
      ...restaurantsOnlyHalal,
      async suggestPlaces(q: { constraints?: { requiredTags?: string[] } }) {
        const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
        return {
          candidates: (q.constraints?.requiredTags ?? []).length > 0 ? [] : FIXTURE_CANDIDATES,
          explainability: null,
          warnings: [],
        }
      },
    }
    const result = await planRoute({
      provider: nothingConforms,
      request,
      locality: { name: 'Abuja' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
      constraints: { requiredTags: ['urn:tag:dietary_option:qloo:halal'] },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.ignored.map((i) => i.label)).toContain('Must-haves')
    expect(result.route.confidence).toBe('weak')
  })
})

describe('avoid terms are resolved to tags, or reported', () => {
  it('reports a term Qloo has no tag for instead of pretending it was excluded', async () => {
    const result = await planRoute({
      provider: new FixtureProvider(),
      request,
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 3,
      constraints: { excludeTags: ['zzzznope'] },
    })
    if ('error' in result) throw new Error(result.error)
    const avoiding = result.ignored.find((i) => i.label === 'Avoiding')
    expect(avoiding?.reason).toContain('zzzznope')
  })

  it('says nothing when every avoid term resolved', async () => {
    const result = await planRoute({
      provider: new FixtureProvider(),
      request,
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 3,
      constraints: { excludeTags: ['cocktails'] },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.ignored.map((i) => i.label)).not.toContain('Avoiding')
  })
})
