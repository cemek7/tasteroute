import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetPreferences,
  loadPreferences,
  PREFERENCES_KEY,
  savePreferences,
} from './preferences'

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('preferences', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  it('round-trips the fields worth keeping', () => {
    savePreferences({
      vibe: ['quiet'],
      budget: 2,
      persona: 'newcomer',
      requirements: { dietary: ['halal'] },
      discovery: 0.8,
    })
    const back = loadPreferences()
    expect(back.vibe).toEqual(['quiet'])
    expect(back.budget).toBe(2)
    expect(back.persona).toBe('newcomer')
    expect(back.requirements?.dietary).toEqual(['halal'])
    expect(back.discovery).toBe(0.8)
  })

  it('never stores demographics', () => {
    savePreferences({ demographics: { ageBand: '25_to_29', gender: 'female' } })
    expect(localStorage.getItem(PREFERENCES_KEY) ?? '').not.toMatch(/25_to_29|female/)
    expect(loadPreferences().demographics).toBeUndefined()
  })

  it('never stores the one-off fields', () => {
    savePreferences({
      seedPlaces: ['Jazzhole'],
      clarified: { question: 'q', answer: 'a' },
    })
    const raw = localStorage.getItem(PREFERENCES_KEY) ?? ''
    expect(raw).not.toContain('Jazzhole')
    expect(raw).not.toContain('answer')
  })

  it('discards a blob from an unknown version', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 99, budget: 2 }))
    expect(loadPreferences()).toEqual({})
  })

  it('discards a hand-edited blob with a wrong-typed field', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, budget: 'cheap' }))
    expect(loadPreferences()).toEqual({})
  })

  it('discards an unknown vibe rather than loading it into the form', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, vibe: ['vibey'] }))
    expect(loadPreferences()).toEqual({})
  })

  it('discards unparseable json', () => {
    localStorage.setItem(PREFERENCES_KEY, 'not json at all')
    expect(loadPreferences()).toEqual({})
  })

  it('returns empty rather than throwing when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    })
    expect(loadPreferences()).toEqual({})
    expect(() => savePreferences({ budget: 2 })).not.toThrow()
  })

  it('forgets everything on request', () => {
    savePreferences({ budget: 2 })
    forgetPreferences()
    expect(loadPreferences()).toEqual({})
  })
})
