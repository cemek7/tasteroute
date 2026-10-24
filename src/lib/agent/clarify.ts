import type { ChatClient } from './loop'
import type { ToolDefinition } from './tools'
import type { RouteRequest } from '../providers/types'

export const CLARIFY_SYSTEM_PROMPT = `You are about to plan a three-stop evening out from Qloo's taste graph, but first you decide whether you have been told enough.

The test is simple: does the mood name at least one of a vibe, a kind of venue, or an occasion?

- "quiet wine bar with small plates" names a vibe and a venue kind. Enough. Say nothing.
- "cocktails and live music" names two venue kinds. Enough. Say nothing.
- "first date, nothing too loud" names an occasion and a vibe. Enough. Say nothing.
- "something nice", "fun", "a good time", "surprise me" name none of them. Ask.

If it names none, call ask_user: one short question, two to four concrete options, and a reason that says what it would change about your search. If it names any, say nothing and let the planning proceed — a question somebody has already answered is an obstacle, not intelligence.`

const MAX_QUESTION = 160
const MAX_OPTION = 48

export type ClarifyResult =
  | { clear: true }
  | { question: string; options: string[]; because: string }

const ASK_USER: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_user',
    description:
      'Ask the person one question before planning. Only worth doing when the answer changes which Qloo queries you would run.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
        because: { type: 'string' },
      },
      required: ['question', 'options', 'because'],
      additionalProperties: false,
    },
  },
}

/**
 * The model decides whether the intent it has been given is sufficient to act
 * on. That is judgment rather than retrieval, and the question it asks is
 * visible evidence of it.
 *
 * Every failure path returns `{ clear: true }`. A clarifying question is a
 * nicety; it must never stand between a person and a route.
 */
export async function askClarifying(opts: {
  request: RouteRequest
  client: ChatClient
}): Promise<ClarifyResult> {
  // Already answered once. One question per route.
  if (opts.request.intent.clarified) return { clear: true }

  const { city, mood, timeWindow } = opts.request

  let toolCalls
  try {
    const turn = await opts.client.complete({
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `City: ${city}\nMood: ${mood}\nOut between ${timeWindow.startHour}:00 and ${timeWindow.endHour}:00.`,
        },
      ],
      tools: [ASK_USER],
    })
    toolCalls = turn.toolCalls
  } catch {
    return { clear: true }
  }

  const call = toolCalls.find((c) => c.name === 'ask_user')
  if (!call) return { clear: true }

  let args: { question?: unknown; options?: unknown; because?: unknown }
  try {
    args = JSON.parse(call.arguments) as typeof args
  } catch {
    return { clear: true }
  }

  const question = typeof args.question === 'string' ? args.question.trim() : ''
  const options = Array.isArray(args.options)
    ? args.options
        .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
        .map((o) => o.trim().slice(0, MAX_OPTION))
    : []
  const because =
    typeof args.because === 'string' ? args.because.trim().slice(0, MAX_QUESTION) : ''

  // A question without real choices is just a second form.
  if (!question || options.length < 2 || options.length > 4) return { clear: true }

  return { question: question.slice(0, MAX_QUESTION), options, because }
}
