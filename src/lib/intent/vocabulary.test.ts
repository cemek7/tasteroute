import { describe, expect, it } from 'vitest'
import {
  ACCESSIBILITY_TAGS,
  AGE_BANDS,
  DIETARY_TAGS,
  OCCASION_QUERIES,
  PARTY_QUERIES,
  VIBE_QUERIES,
  VIBE_IDS,
} from './vocabulary'

describe('vocabulary', () => {
  it('gives every vibe at least one query to resolve', () => {
    for (const id of VIBE_IDS) {
      expect(VIBE_QUERIES[id].length).toBeGreaterThan(0)
    }
  })

  it('gives every occasion at least one query', () => {
    for (const [id, queries] of Object.entries(OCCASION_QUERIES)) {
      expect(queries.length, id).toBeGreaterThan(0)
    }
  })

  it('gives every party composition at least one query', () => {
    for (const [id, queries] of Object.entries(PARTY_QUERIES)) {
      expect(queries.length, id).toBeGreaterThan(0)
    }
  })

  it('maps dietary needs to the tag urns observed on the live host', () => {
    expect(DIETARY_TAGS.halal).toBe('urn:tag:dietary_option:qloo:halal')
    expect(DIETARY_TAGS.vegetarian).toBe('urn:tag:dietary_option:qloo:vegetarian')
    expect(DIETARY_TAGS.vegan).toBe('urn:tag:dietary_option:qloo:vegan')
  })

  it('maps accessibility needs to the accessibility namespace', () => {
    for (const urn of Object.values(ACCESSIBILITY_TAGS)) {
      expect(urn).toMatch(/^urn:tag:accessibility:place:/)
    }
  })

  it('uses the age bands Qloo accepts, not the ones that look right', () => {
    expect(AGE_BANDS).toContain('24_and_younger')
    expect(AGE_BANDS).not.toContain('25_and_younger')
  })
})
