import { Budget, DEFAULT_MAX_ROUNDS } from './budget'
import { createSession, type ToolDefinition } from './tools'
import { UnknownLocalityError } from '../providers/qloo'
import type {
  Locality,
  Route,
  RouteRequest,
  TasteProvider,
  TraceEntry,
} from '../providers/types'

export const SYSTEM_PROMPT = `You plan a three-stop evening out using Qloo's taste graph.

How to work:
1. Call find_tags to turn the user's mood into real Qloo tag ids. Mood phrases usually
   have several parts: resolve each one separately.
2. If the user names a place they already like, call seed_entities. Seeding with
   entities is the only way Qloo returns explainability, which makes the reasons better.
3. Call suggest_places with the tag ids you found. Read the assessment it returns.
   If the confidence is weak, call suggest_places again with broader or different tags
   before giving up. Aim for at least three options per slot.
4. Call finalize_route when the pool is good enough.

What you do not do: you never choose, score or order the stops, and you never write the
reasons. TasteRoute does that from Qloo's own data. Your job is to ask Qloo the right
questions. Do not invent place names, tag ids or entity ids: only use ids that a tool
returned to you.`

export type ChatToolCall = { id: string; name: string; arguments: string }

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
}

export type ChatClient = {
  complete(input: {
    system: string
    messages: ChatMessage[]
    tools: ToolDefinition[]
  }): Promise<{ toolCalls: ChatToolCall[] }>
}

export type PlanOptions = {
  provider: TasteProvider
  request: RouteRequest
  locality: Locality
  client: ChatClient
  maxRounds?: number
}

export type PlanResult =
  | { route: Route; roundsUsed: number }
  | { error: string; trace: TraceEntry[] }

export async function planRoute(opts: PlanOptions): Promise<PlanResult> {
  const { provider, request, locality, client } = opts
  const budget = new Budget(opts.maxRounds ?? DEFAULT_MAX_ROUNDS)
  const session = createSession({ provider, request, locality })

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `City: ${request.city}\nMood: ${request.mood}\nOut between ${request.timeWindow.startHour}:00 and ${request.timeWindow.endHour}:00.`,
    },
  ]

  let lastFinalizeFailure: string | null = null

  while (budget.consumeRound()) {
    let toolCalls: ChatToolCall[]
    try {
      const turn = await client.complete({
        system: SYSTEM_PROMPT,
        messages,
        tools: session.tools,
      })
      toolCalls = turn.toolCalls
    } catch (e) {
      return {
        error: `The planner could not be reached: ${(e as Error).message}`,
        trace: session.trace,
      }
    }

    if (toolCalls.length === 0) break

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {}
      } catch {
        args = {}
      }

      let result: unknown
      try {
        result = await session.dispatch(call.name, args)
      } catch (e) {
        // An unknown city is terminal: no amount of retrying fixes it.
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
        // Anything else is reported back to the model, which may recover.
        result = { error: (e as Error).message }
      }

      if (call.name === 'finalize_route') {
        const r = result as { ok?: boolean; reason?: string }
        if (r.ok === false && r.reason) lastFinalizeFailure = r.reason
      }

      messages.push({
        role: 'tool',
        content: JSON.stringify(result).slice(0, 4000),
        toolCallId: call.id,
      })
    }

    if (session.finalRoute) break
  }

  // The model may stop early or run out of rounds. Build from whatever was
  // gathered rather than returning nothing.
  if (!session.finalRoute) {
    const forced = (await session.dispatch('finalize_route', {})) as {
      ok?: boolean
      reason?: string
    }
    if (forced.ok === false && forced.reason) lastFinalizeFailure = forced.reason
  }

  const route = session.finalRoute
  if (!route) {
    return {
      error: lastFinalizeFailure ?? 'Not enough places came back to build a three-stop route.',
      trace: session.trace,
    }
  }

  return { route: { ...route, trace: session.trace }, roundsUsed: budget.roundsUsed }
}
