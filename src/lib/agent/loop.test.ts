import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { planRoute, type ChatClient } from './loop'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Lagos',
  mood: 'low-key but not dead',
  timeWindow: { startHour: 18, endHour: 23 },
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

  it('returns an error rather than a route when the pool cannot fill three slots', async () => {
    const result = await run(
      scriptedClient([
        {
          calls: [
            { name: 'suggest_places', args: { tagIds: ['urn:tag:genre:place:cafe'] } },
          ],
        },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toMatch(/close/)
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

  it('reports a model outage as an error instead of throwing', async () => {
    const broken: ChatClient = {
      async complete() {
        throw new Error('402 insufficient credit')
      },
    }
    const result = await run(broken)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toContain('insufficient credit')
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
})
