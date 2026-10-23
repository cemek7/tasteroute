import { beforeEach, describe, expect, it } from 'vitest'
import { SpendLimiter, trimForBudget } from './spend'

describe('SpendLimiter', () => {
  let clock: number
  const now = () => clock

  beforeEach(() => {
    clock = Date.parse('2026-10-23T12:00:00Z')
  })

  it('allows requests up to the daily ceiling then refuses', () => {
    const l = new SpendLimiter({ dailyCeiling: 3, now })
    expect(l.tryConsume()).toBe(true)
    expect(l.tryConsume()).toBe(true)
    expect(l.tryConsume()).toBe(true)
    expect(l.tryConsume()).toBe(false)
  })

  it('reports how many are left', () => {
    const l = new SpendLimiter({ dailyCeiling: 2, now })
    l.tryConsume()
    expect(l.remaining).toBe(1)
  })

  it('resets once the window rolls over', () => {
    const l = new SpendLimiter({ dailyCeiling: 1, now })
    expect(l.tryConsume()).toBe(true)
    expect(l.tryConsume()).toBe(false)
    clock += 24 * 60 * 60 * 1000 + 1000
    expect(l.tryConsume()).toBe(true)
  })

  it('never goes negative', () => {
    const l = new SpendLimiter({ dailyCeiling: 1, now })
    l.tryConsume()
    l.tryConsume()
    l.tryConsume()
    expect(l.remaining).toBe(0)
  })
})

describe('trimForBudget', () => {
  const msg = (role: 'user' | 'assistant' | 'tool', content: string) => ({ role, content })

  it('leaves a small conversation untouched', () => {
    const messages = [msg('user', 'hello'), msg('tool', '{"ok":true}')]
    expect(trimForBudget(messages, 10_000)).toEqual(messages)
  })

  it('keeps the first user message, which carries the city and mood', () => {
    const messages = [
      msg('user', 'City: Abuja'),
      ...Array.from({ length: 40 }, () => msg('tool', 'x'.repeat(4000))),
    ]
    const trimmed = trimForBudget(messages, 2000)
    expect(trimmed[0]).toEqual(messages[0])
  })

  it('drops oldest tool results until the estimate fits', () => {
    const messages = [
      msg('user', 'City: Abuja'),
      ...Array.from({ length: 40 }, (_, i) => msg('tool', `${i}-${'x'.repeat(4000)}`)),
    ]
    const trimmed = trimForBudget(messages, 3000)
    expect(trimmed.length).toBeLessThan(messages.length)
    const chars = trimmed.reduce((n, m) => n + m.content.length, 0)
    expect(chars / 4).toBeLessThanOrEqual(3000)
  })

  it('keeps the most recent tool result, which the model just asked for', () => {
    const messages = [
      msg('user', 'City: Abuja'),
      ...Array.from({ length: 20 }, (_, i) => msg('tool', `old-${i}-${'x'.repeat(4000)}`)),
      msg('tool', 'newest'),
    ]
    const trimmed = trimForBudget(messages, 1200)
    expect(trimmed.at(-1)?.content).toBe('newest')
  })
})
