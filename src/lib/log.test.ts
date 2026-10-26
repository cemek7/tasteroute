import { afterEach, describe, expect, it } from 'vitest'
import { safeMessage } from './log'

const KEY = 'qlo_7f3ab91c4d5e6f70a1b2c3d4'

afterEach(() => {
  delete process.env.QLOO_API_KEY
  delete process.env.OPENAI_API_KEY
})

describe('safeMessage', () => {
  it('keeps an ordinary message intact', () => {
    expect(safeMessage(new Error('Qloo /v2/insights returned 400'))).toBe(
      'Qloo /v2/insights returned 400',
    )
  })

  it('redacts a whole key that leaked into the message', () => {
    process.env.QLOO_API_KEY = KEY
    const out = safeMessage(new Error(`request failed with X-Api-Key: ${KEY}`))
    expect(out).not.toContain(KEY)
    expect(out).toContain('[redacted]')
  })

  it('redacts a truncated key, which is the shape that actually leaks', () => {
    process.env.QLOO_API_KEY = KEY
    const out = safeMessage(new Error(`bad key ${KEY.slice(0, 14)}`))
    expect(out).not.toContain(KEY.slice(0, 14))
  })

  it('redacts an sk- token even when no env var names it', () => {
    const out = safeMessage(new Error('401 from sk-or-v1-9a8b7c6d5e4f3a2b1c0d'))
    expect(out).not.toContain('9a8b7c6d')
    expect(out).toContain('[redacted]')
  })

  it('redacts a bearer token in a header echo', () => {
    const out = safeMessage(new Error('authorization: Bearer abcdef0123456789abcdef'))
    expect(out).not.toContain('abcdef0123456789')
  })

  it('never throws on a non-Error, so logging cannot break a request', () => {
    expect(safeMessage(undefined)).toBe('unknown error')
    expect(safeMessage('plain string')).toBe('plain string')
  })

  it('ignores a short or empty secret rather than redacting everything', () => {
    process.env.QLOO_API_KEY = ''
    expect(safeMessage(new Error('nothing to hide here'))).toBe('nothing to hide here')
  })
})
