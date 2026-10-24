import { describe, expect, it } from 'vitest'
import { constraintsFromIntent } from '../intent/qloo-params'
import { buildRoute, type BuildInput } from './build'
import { FIXTURE_CANDIDATES } from '../providers/fixture'

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
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
  intentEcho: { applied: [], ignored: [] },
  ...over,
})

describe('requirements become hard tag filters', () => {
  it('turns halal into the dietary tag Qloo publishes', () => {
    const { constraints } = constraintsFromIntent({ requirements: { dietary: ['halal'] } })
    expect(constraints.requiredTags).toEqual(['urn:tag:dietary_option:qloo:halal'])
  })

  it('combines dietary and accessibility needs', () => {
    const { constraints } = constraintsFromIntent({
      requirements: { dietary: ['vegan'], accessibility: ['wheelchair_entrance'] },
    })
    expect(constraints.requiredTags).toHaveLength(2)
  })

  it('turns an avoid term into an exclusion, not a preference', () => {
    const { constraints } = constraintsFromIntent({ avoid: ['hookah'] })
    expect(constraints.excludeTags).toEqual(['hookah'])
  })

  it('says what it applied', () => {
    const { applied } = constraintsFromIntent({ requirements: { dietary: ['halal'] } })
    expect(applied.some((a) => a.label === 'Must-haves' && a.detail.includes('halal'))).toBe(true)
  })
})

describe('a dropped requirement is reported and lowers confidence', () => {
  it('drops confidence to weak when a requirement was relaxed', () => {
    const r = buildRoute(
      input({
        intentEcho: {
          applied: [],
          ignored: [{ label: 'Must-haves', reason: 'nothing matched' }],
        },
      }),
    )
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).toBe('weak')
  })

  it('leaves confidence alone when only a soft constraint was relaxed', () => {
    const r = buildRoute(
      input({
        intentEcho: {
          applied: [],
          ignored: [{ label: 'Hidden gems', reason: 'nothing matched' }],
        },
      }),
    )
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).not.toBe('weak')
  })

  it('carries the echo onto the route so the UI can show it', () => {
    const echo = {
      applied: [{ label: 'Budget', detail: 'nothing above 2' }],
      ignored: [],
    }
    const r = buildRoute(input({ intentEcho: echo }))
    if ('error' in r) throw new Error('expected a route')
    expect(r.intentEcho).toEqual(echo)
  })
})
