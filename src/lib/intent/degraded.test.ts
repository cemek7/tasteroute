import { describe, expect, it } from 'vitest'
import { degradedEcho } from './degraded'

describe('degradedEcho', () => {
  it('reports every stated constraint as unhonoured', () => {
    const echo = degradedEcho([
      { label: 'Must-haves', detail: 'halal' },
      { label: 'Budget', detail: 'nothing above 1' },
    ])
    expect(echo.applied).toEqual([])
    expect(echo.ignored.map((i) => i.label)).toEqual(['Must-haves', 'Budget'])
    for (const i of echo.ignored) expect(i.reason).toMatch(/sample/i)
  })

  it('is empty when nothing was stated', () => {
    expect(degradedEcho([])).toEqual({ applied: [], ignored: [] })
  })

  it('never claims a constraint was applied', () => {
    const echo = degradedEcho([{ label: 'Hidden gems', detail: 'below 0.5' }])
    expect(echo.applied).toHaveLength(0)
  })
})

describe('the sample-data path cannot honour a stated need', () => {
  it('forces weak confidence and names every dropped constraint', async () => {
    const { buildRoute } = await import('../route/build')
    const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
    const { constraintsFromIntent } = await import('./qloo-params')

    const { applied } = constraintsFromIntent({
      requirements: { dietary: ['halal'] },
      budget: 1,
      area: { radiusMetres: 1000 },
    })
    const r = buildRoute({
      candidates: FIXTURE_CANDIDATES,
      request: {
        city: 'Abuja',
        mood: 'dinner',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: {},
      },
      locality: { name: 'Abuja' },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
      intentEcho: degradedEcho(applied),
    })
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).toBe('weak')
    expect(r.intentEcho.applied).toEqual([])
    expect(r.intentEcho.ignored.map((i) => i.label)).toContain('Must-haves')
  })
})
