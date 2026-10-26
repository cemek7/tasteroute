import { describe, expect, it } from 'vitest'
import { readStashedRoute, stashRoute } from './session'
import { buildRoute } from '../route/build'
import { FIXTURE_CANDIDATES, FixtureProvider } from '../providers/fixture'
import { normaliseWindow } from '../route/window'
import type { Route } from '../providers/types'

const aRoute = (): Route => {
  const r = buildRoute({
    candidates: FIXTURE_CANDIDATES,
    request: {
      city: 'Lagos',
      mood: 'anything',
      timeWindow: normaliseWindow(18, 23),
      intent: {},
    },
    locality: { name: 'Lagos' },
    requestedTagIds: [],
    explainability: null,
    seedNames: {},
    trace: [{ at: 'now', tool: 'suggest_places', argsSummary: 'x', resultSummary: 'y', ms: 12 }],
    providerKind: 'fixture',
    intentEcho: { applied: [], ignored: [] },
  })
  if ('error' in r) throw new Error('expected a route')
  return r
}

const fakeStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('the stash that carries a plan to its own page', () => {
  it('round-trips a plan', () => {
    const store = fakeStorage()
    const route = aRoute()
    stashRoute(route, store)
    expect(readStashedRoute(store)?.id).toBe(route.id)
  })

  it('keeps the trace, which a share link deliberately drops', () => {
    const store = fakeStorage()
    stashRoute(aRoute(), store)
    expect(readStashedRoute(store)?.trace.length).toBeGreaterThan(0)
  })

  it('returns null when nothing was stashed', () => {
    expect(readStashedRoute(fakeStorage())).toBeNull()
  })

  it('returns null rather than throwing on unreadable contents', () => {
    const store = fakeStorage()
    store.setItem('tasteroute:plan', 'not json')
    expect(readStashedRoute(store)).toBeNull()
  })

  it('rejects a stash that is not a plan, so a tampered one cannot render', () => {
    const store = fakeStorage()
    store.setItem('tasteroute:plan', JSON.stringify({ id: 'x', stops: 'nope' }))
    expect(readStashedRoute(store)).toBeNull()
  })

  it('survives storage being unavailable, because the page must still load', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(() => stashRoute(aRoute(), broken)).not.toThrow()
    expect(readStashedRoute(broken)).toBeNull()
  })
})
