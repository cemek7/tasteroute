import { describe, expect, it } from 'vitest'
import { Budget } from './budget'

describe('Budget', () => {
  it('allows the configured number of rounds then stops', () => {
    const b = new Budget(3)
    expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(false)
  })

  it('reports rounds used', () => {
    const b = new Budget(6)
    b.consumeRound()
    b.consumeRound()
    expect(b.roundsUsed).toBe(2)
  })

  it('reports exhaustion', () => {
    const b = new Budget(1)
    expect(b.exhausted).toBe(false)
    b.consumeRound()
    expect(b.exhausted).toBe(true)
  })

  it('defaults to six rounds, matching the spec cap', () => {
    const b = new Budget()
    for (let i = 0; i < 6; i++) expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(false)
  })
})
