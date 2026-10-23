export const DEFAULT_MAX_ROUNDS = 6

export class Budget {
  private used = 0

  constructor(private readonly maxRounds: number = DEFAULT_MAX_ROUNDS) {}

  consumeRound(): boolean {
    if (this.used >= this.maxRounds) return false
    this.used += 1
    return true
  }

  get roundsUsed(): number {
    return this.used
  }

  get exhausted(): boolean {
    return this.used >= this.maxRounds
  }
}
