import type { ChatMessage } from './loop'

/** Rough but stable: four characters to a token is close enough to budget on. */
const CHARS_PER_TOKEN = 4
const WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * A ceiling on how many routes this process will plan in a day.
 *
 * The demo URL is public and unauthenticated, and the OpenRouter credit behind
 * it is small. Without a ceiling one scripted loop empties the account and the
 * demo stops answering — during judging, most likely. Past the ceiling the app
 * serves clearly labelled sample routes instead, which is a worse answer than
 * a real one but far better than an error page.
 *
 * This is per process, so it is a brake rather than a guarantee: a serverless
 * deployment may run several. That is stated rather than hidden.
 */
export class SpendLimiter {
  private used = 0
  private windowStart: number
  private readonly dailyCeiling: number
  private readonly now: () => number

  constructor(opts: { dailyCeiling?: number; now?: () => number } = {}) {
    this.dailyCeiling = opts.dailyCeiling ?? 400
    this.now = opts.now ?? Date.now
    this.windowStart = this.now()
  }

  private roll(): void {
    if (this.now() - this.windowStart >= WINDOW_MS) {
      this.windowStart = this.now()
      this.used = 0
    }
  }

  tryConsume(): boolean {
    this.roll()
    if (this.used >= this.dailyCeiling) return false
    this.used += 1
    return true
  }

  get remaining(): number {
    this.roll()
    return Math.max(0, this.dailyCeiling - this.used)
  }
}

/**
 * Keep the conversation under an input-token estimate by dropping the oldest
 * tool results. The first user message carries the city and mood and is always
 * kept; so is the newest message, which is what the model just asked for.
 */
export function trimForBudget(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const estimate = (list: ChatMessage[]) =>
    list.reduce((n, m) => n + m.content.length, 0) / CHARS_PER_TOKEN

  if (estimate(messages) <= maxTokens) return messages
  if (messages.length <= 2) return messages

  const first = messages[0]
  const rest = messages.slice(1)

  // Drop from the front of the middle, keeping the tail.
  let dropped = 0
  while (dropped < rest.length - 1 && estimate([first, ...rest.slice(dropped)]) > maxTokens) {
    dropped += 1
  }
  return [first, ...rest.slice(dropped)]
}
