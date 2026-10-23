import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildWhy, type WhyContext } from './why'
import type { Candidate } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

const ctx = (over: Partial<WhyContext> = {}): WhyContext => ({
  requestedTagIds: [],
  locality: 'Lagos',
  explainability: null,
  seedNames: {},
  ...over,
})

describe('buildWhy', () => {
  it('leads with Qloo explainability when the seeded response returned this candidate', () => {
    const { why, evidence } = buildWhy(byId('fx-bar-slate'), ctx({
      explainability: {
        signalEntities: [
          { entityId: 'fx-nok', avgScore: 1, topN: 3, appliesTo: ['fx-bar-slate'] },
        ],
      },
      seedNames: { 'fx-nok': 'Terrace Nine Kitchen' },
    }))
    expect(evidence[0].kind).toBe('explainability')
    expect(why).toContain('Terrace Nine Kitchen')
  })

  it('withholds explainability from a candidate the seeded response did not return', () => {
    const { evidence } = buildWhy(byId('fx-bar-slate'), ctx({
      explainability: {
        signalEntities: [
          { entityId: 'fx-nok', avgScore: 1, topN: 3, appliesTo: ['some-other-place'] },
        ],
      },
      seedNames: { 'fx-nok': 'Terrace Nine Kitchen' },
    }))
    expect(evidence.some((e) => e.kind === 'explainability')).toBe(false)
  })

  it('never cites a seed as the reason for recommending that same seed', () => {
    const { evidence } = buildWhy(byId('fx-nok'), ctx({
      explainability: {
        signalEntities: [{ entityId: 'fx-nok', avgScore: 1, topN: 3, appliesTo: ['fx-nok'] }],
      },
      seedNames: { 'fx-nok': 'Terrace Nine Kitchen' },
    }))
    expect(evidence.some((e) => e.kind === 'explainability')).toBe(false)
  })

  it('cites matched tags by name', () => {
    const { why, evidence } = buildWhy(byId('fx-bar-slate'), ctx({
      requestedTagIds: ['urn:tag:genre:place:restaurant:cocktail_bar'],
    }))
    expect(evidence.some((e) => e.kind === 'tag')).toBe(true)
    expect(why).toContain('Cocktail Bar')
  })

  it('marks every piece of evidence as sourced from qloo', () => {
    const { evidence } = buildWhy(byId('fx-nok'), ctx())
    expect(evidence.length).toBeGreaterThan(0)
    expect(evidence.every((e) => e.source === 'qloo')).toBe(true)
  })

  it('includes the affinity score as evidence when present', () => {
    const { evidence } = buildWhy(byId('fx-nok'), ctx())
    const aff = evidence.find((e) => e.kind === 'affinity')
    expect(aff?.value).toBe(0.88)
  })

  it('falls back to neutral factual text when there is no evidence at all', () => {
    const bare: Candidate = {
      ...byId('fx-nok'),
      affinity: null,
      popularity: null,
      tags: [],
      descriptors: {},
    }
    const { why, evidence } = buildWhy(bare, ctx())
    expect(evidence).toEqual([])
    expect(why).toBe('A restaurant in Lagos.')
  })

  it('never invents a rationale for a candidate stripped of all signal', () => {
    const bare: Candidate = {
      ...byId('fx-nok'),
      category: null,
      affinity: null,
      popularity: null,
      tags: [],
      descriptors: {},
    }
    const { why } = buildWhy(bare, ctx())
    expect(why).toBe('A place in Lagos.')
    expect(why).not.toMatch(/perfect|great|ideal|vibe|you.ll love/i)
  })

  it('is deterministic for the same input', () => {
    const a = buildWhy(byId('fx-bar-slate'), ctx())
    const b = buildWhy(byId('fx-bar-slate'), ctx())
    expect(a.why).toBe(b.why)
  })
})
