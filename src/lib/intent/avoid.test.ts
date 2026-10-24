import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { resolveAvoidTags } from './avoid'

describe('resolveAvoidTags', () => {
  const provider = new FixtureProvider()

  it('resolves nothing when nothing was avoided', async () => {
    expect(await resolveAvoidTags(provider, undefined)).toEqual({ tagIds: [], unresolved: [] })
  })

  it('turns a word into the Qloo tag urns that match it', async () => {
    const r = await resolveAvoidTags(provider, ['cocktails'])
    expect(r.tagIds.length).toBeGreaterThan(0)
    for (const id of r.tagIds) expect(id).toMatch(/^urn:tag:/)
    expect(r.unresolved).toEqual([])
  })

  it('reports a word Qloo has no tag for rather than passing it through', async () => {
    // Raw words in filter.exclude.tags are a measured no-op, so sending one
    // would be a claim we cannot keep.
    const r = await resolveAvoidTags(provider, ['zzzznope'])
    expect(r.tagIds).toEqual([])
    expect(r.unresolved).toEqual(['zzzznope'])
  })

  it('keeps the resolved ones and reports only the rest', async () => {
    const r = await resolveAvoidTags(provider, ['cocktails', 'zzzznope'])
    expect(r.tagIds.length).toBeGreaterThan(0)
    expect(r.unresolved).toEqual(['zzzznope'])
  })

  it('never emits a bare word as a tag id', async () => {
    const r = await resolveAvoidTags(provider, ['hookah', 'cocktails'])
    for (const id of r.tagIds) expect(id.startsWith('urn:tag:')).toBe(true)
  })

  it('deduplicates', async () => {
    const r = await resolveAvoidTags(provider, ['cocktails', 'cocktails'])
    expect(new Set(r.tagIds).size).toBe(r.tagIds.length)
  })
})

describe('accessibility options are only the ones Qloo publishes', () => {
  it('offers no step-free option, because Qloo has no step-free tag', async () => {
    const { ACCESSIBILITY_IDS, ACCESSIBILITY_TAGS } = await import('./vocabulary')
    expect(ACCESSIBILITY_IDS).not.toContain('step_free')
    // Every id maps to a tag observed on the live host.
    const real = new Set([
      'urn:tag:accessibility:place:wheelchair_accessible_entrance',
      'urn:tag:accessibility:place:wheelchair_accessible_restroom',
      'urn:tag:accessibility:place:wheelchair_accessible_seating',
      'urn:tag:accessibility:place:wheelchair_accessible_elevator',
      'urn:tag:accessibility:place:wheelchair_accessible_parking_lot',
    ])
    for (const urn of Object.values(ACCESSIBILITY_TAGS)) expect(real.has(urn)).toBe(true)
  })
})
