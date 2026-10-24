import { describe, expect, it, vi } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute } from '../route/build'
import { decodeRoute, encodeRoute } from './encode'
import type { Route } from '../providers/types'

const route = (): Route => {
  const r = buildRoute({
    candidates: FIXTURE_CANDIDATES,
    request: { city: 'Lagos', mood: 'low-key', timeWindow: { startHour: 18, endHour: 23 }, intent: {} },
    locality: { name: 'Lagos' },
    requestedTagIds: [],
    explainability: null,
    seedNames: {},
    trace: [],
    providerKind: 'fixture',
      intentEcho: { applied: [], ignored: [] },
  })
  if ('error' in r) throw new Error('fixture route should build')
  return r
}

describe('encodeRoute / decodeRoute', () => {
  it('round-trips a route', () => {
    const r = route()
    const back = decodeRoute(encodeRoute(r))
    expect(back?.stops.map((s) => s.candidate.name)).toEqual(r.stops.map((s) => s.candidate.name))
    expect(back?.mood).toBe(r.mood)
    expect(back?.providerKind).toBe(r.providerKind)
  })

  it('produces a url-safe string with no padding', () => {
    expect(encodeRoute(route())).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('round-trips text with non-ascii characters', () => {
    const r = route()
    const back = decodeRoute(encodeRoute({ ...r, mood: 'café crawl — Yar’Adua' }))
    expect(back?.mood).toBe('café crawl — Yar’Adua')
  })

  it('returns null for a truncated string rather than throwing', () => {
    const half = encodeRoute(route()).slice(0, 20)
    expect(decodeRoute(half)).toBeNull()
  })

  it('returns null for arbitrary junk', () => {
    expect(decodeRoute('not-a-route-at-all')).toBeNull()
    expect(decodeRoute('')).toBeNull()
  })

  it('returns null for valid base64 that is not a route', () => {
    const notARoute = Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64url')
    expect(decodeRoute(notARoute)).toBeNull()
  })

  it('returns null for a route with the wrong number of stops', () => {
    const r = route()
    const tampered = { ...r, stops: [r.stops[0]] }
    const encoded = Buffer.from(JSON.stringify(tampered)).toString('base64url')
    expect(decodeRoute(encoded)).toBeNull()
  })

  it('drops the trace from the shared payload to keep the link short', () => {
    const r = {
      ...route(),
      trace: [{ at: 'now', tool: 'x', argsSummary: 'a', resultSummary: 'b', ms: 1 }],
    }
    expect(decodeRoute(encodeRoute(r))?.trace).toEqual([])
  })

  it('always returns arrays for alternatives and unfilledSlots, even if absent', () => {
    const r = route()
    const stripped = { ...r } as Record<string, unknown>
    delete stripped.alternatives
    delete stripped.unfilledSlots
    const encoded = Buffer.from(JSON.stringify(stripped)).toString('base64url')
    const back = decodeRoute(encoded)
    expect(back?.alternatives).toEqual([])
    expect(back?.unfilledSlots).toEqual([])
  })
})

describe('a well-formed but wrong-typed payload is rejected, not passed through', () => {
  const tamper = (mutate: (r: Record<string, unknown>) => void): string => {
    const r = JSON.parse(JSON.stringify(route())) as Record<string, unknown>
    mutate(r)
    return Buffer.from(JSON.stringify(r)).toString('base64url')
  }

  it('rejects a non-array alternatives, which the UI would call .map on', () => {
    expect(decodeRoute(tamper((r) => { r.alternatives = 'oops' }))).toBeNull()
    expect(decodeRoute(tamper((r) => { r.alternatives = { length: 1 } }))).toBeNull()
  })

  it('rejects a walkFromPrev missing metres, which the UI would call toLocaleString on', () => {
    expect(
      decodeRoute(
        tamper((r) => {
          const stops = r.stops as Record<string, unknown>[]
          stops[1].walkFromPrev = { minutes: 5 }
        }),
      ),
    ).toBeNull()
  })

  it('rejects an object where an address string belongs, which React cannot render', () => {
    expect(
      decodeRoute(
        tamper((r) => {
          const stops = r.stops as Record<string, unknown>[]
          ;(stops[0].candidate as Record<string, unknown>).address = {}
        }),
      ),
    ).toBeNull()
  })

  it('rejects an unknown evidence kind, which has no UI label', () => {
    expect(
      decodeRoute(
        tamper((r) => {
          const stops = r.stops as Record<string, unknown>[]
          stops[0].evidence = [{ kind: 'made-up', label: 'x', source: 'qloo' }]
        }),
      ),
    ).toBeNull()
  })

  it('rejects a non-numeric walk duration', () => {
    expect(
      decodeRoute(
        tamper((r) => {
          const stops = r.stops as Record<string, unknown>[]
          stops[1].walkFromPrev = { metres: 'far', minutes: 5 }
        }),
      ),
    ).toBeNull()
  })

  it('returns only validated data, so every surviving field has its declared type', () => {
    const back = decodeRoute(encodeRoute(route()))
    expect(back).not.toBeNull()
    expect(Array.isArray(back?.alternatives)).toBe(true)
    expect(Array.isArray(back?.unfilledSlots)).toBe(true)
    for (const stop of back!.stops) {
      expect(typeof stop.candidate.name).toBe('string')
      expect(stop.candidate.address === null || typeof stop.candidate.address === 'string').toBe(true)
      if (stop.walkFromPrev) {
        expect(typeof stop.walkFromPrev.metres).toBe('number')
        expect(typeof stop.walkFromPrev.minutes).toBe('number')
      }
    }
  })
})

describe('saved routes are validated like any other stored blob', () => {
  const memoryStorage = () => {
    const map = new Map<string, string>()
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    }
  }

  it('round-trips a route saved by this version', async () => {
    const { listSavedRoutes, saveRoute } = await import('./encode')
    vi.stubGlobal('localStorage', memoryStorage())
    saveRoute(route())
    expect(listSavedRoutes()).toHaveLength(1)
  })

  it('discards a route saved before intentEcho and narrative existed', async () => {
    const { listSavedRoutes } = await import('./encode')
    vi.stubGlobal('localStorage', memoryStorage())
    // Exactly the shape the previous version wrote: the storage key is
    // unchanged, so a returning person has one of these.
    const old = JSON.parse(JSON.stringify(route())) as Record<string, unknown>
    delete old.intentEcho
    delete old.narrative
    delete old.narrativeWindow
    delete old.alternativesBySlot
    localStorage.setItem('tasteroute.saved.v1', JSON.stringify([old]))

    const back = listSavedRoutes()
    // Either repaired with defaults or dropped — but never handed to the UI
    // with the fields it reads missing.
    for (const r of back) {
      expect(r.intentEcho).toBeDefined()
      expect(r.narrative).toBeDefined()
      expect(r.alternativesBySlot).toBeDefined()
    }
  })

  it('drops a hand-edited row rather than loading it', async () => {
    const { listSavedRoutes } = await import('./encode')
    vi.stubGlobal('localStorage', memoryStorage())
    localStorage.setItem('tasteroute.saved.v1', JSON.stringify([{ id: 'nonsense' }, 42, null]))
    expect(listSavedRoutes()).toEqual([])
  })

  it('keeps the good rows and drops the bad ones', async () => {
    const { listSavedRoutes, saveRoute } = await import('./encode')
    vi.stubGlobal('localStorage', memoryStorage())
    saveRoute(route())
    const stored = JSON.parse(localStorage.getItem('tasteroute.saved.v1')!)
    localStorage.setItem('tasteroute.saved.v1', JSON.stringify([{ bad: true }, ...stored]))
    expect(listSavedRoutes()).toHaveLength(1)
  })

  it('returns empty rather than throwing when storage is blocked', async () => {
    const { listSavedRoutes } = await import('./encode')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
      removeItem: () => {},
    })
    expect(listSavedRoutes()).toEqual([])
  })
})
