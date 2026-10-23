import { Budget, DEFAULT_MAX_ROUNDS } from './budget'
import { createSession, type ToolDefinition } from './tools'
import { UnknownLocalityError } from '../providers/qloo'
import type {
  Locality,
  Route,
  RouteRequest,
  SlotName,
  TasteProvider,
  TraceEntry,
} from '../providers/types'

export const SYSTEM_PROMPT = `You plan a three-stop evening out using Qloo's taste graph.

How to work:
1. Call find_tags to turn the user's mood into real Qloo tag ids. Mood phrases usually
   have several parts: resolve each one separately.
2. If the user names a place they already like, call seed_entities. Seeding with
   entities is the only way Qloo returns explainability, which makes the reasons better.
3. Call suggest_places with the tag ids you found. You MUST do this at least once:
   finalize_route has nothing to build from until you have. Read the assessment it
   returns. If the confidence is weak, call suggest_places again with broader or
   different tags before giving up. Aim for at least three options per slot.
   If a tag returns nothing, try suggest_places with no tags at all to see what the
   city has.
4. Call finalize_route only after suggest_places has filled the pool.

What you do not do: you never choose, score or order the stops, and you never write the
reasons. TasteRoute does that from Qloo's own data. Your job is to ask Qloo the right
questions. Do not invent place names, tag ids or entity ids: only use ids that a tool
returned to you.`

export type ChatToolCall = { id: string; name: string; arguments: string }

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** Set on a tool message: the assistant tool_call it answers. */
  toolCallId?: string
  /** Set on an assistant message that requested tools. */
  toolCalls?: ChatToolCall[]
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
  let nudged = false
  let roundsWithoutSearch = 0

  while (budget.consumeRound()) {
    // The model has been seen spending its whole budget resolving tags. Once
    // two rounds have gone by with nothing searched, say so plainly.
    if (!nudged && roundsWithoutSearch >= 2 && session.pool.length === 0) {
      messages.push({
        role: 'user',
        content:
          'You have resolved tags but have not searched yet. Call suggest_places now with the tag ids you already have, then finalize_route.',
      })
      nudged = true
    }

    let toolCalls: ChatToolCall[]
    try {
      toolCalls = await completeWithRetry(client, messages, session.tools)
    } catch (e) {
      return {
        error: `The planner could not be reached: ${(e as Error).message}`,
        trace: session.trace,
      }
    }

    if (toolCalls.length === 0) break
    if (!toolCalls.some((c) => c.name === 'suggest_places')) roundsWithoutSearch += 1

    // OpenAI's format requires the assistant turn that requested the tools to
    // precede their results. Omitting it is a 400 from the provider.
    messages.push({ role: 'assistant', content: '', toolCalls })

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

  // The model may stop early, run out of rounds, or skip the search entirely
  // and go straight to finalize. Rescue all three rather than returning nothing.
  if (!session.finalRoute) {
    if (session.pool.length === 0) {
      try {
        await session.dispatch('suggest_places', {
          tagIds: session.requestedTagIds.slice(0, 5),
        })
      } catch (e) {
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
        // Report it rather than swallowing it: a silent failure here looks
        // identical to the model simply not searching.
        return {
          error: `Could not reach Qloo for ${locality.name}: ${(e as Error).message}`,
          trace: session.trace,
        }
      }
    }

    const forced = (await session.dispatch('finalize_route', {})) as {
      ok?: boolean
      reason?: string
      unfilledSlots?: SlotName[]
    }
    if (forced.ok === false && forced.reason) lastFinalizeFailure = forced.reason

    // A three-stop route needs one venue of each kind. The model searches on
    // taste and can easily come back with, say, only bars. Cover the gap with
    // canonical queries and try once more.
    if (!session.finalRoute && forced.unfilledSlots?.length) {
      try {
        await session.backfillSlots(forced.unfilledSlots)
      } catch (e) {
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
      }

      const retried = (await session.dispatch('finalize_route', {})) as {
        ok?: boolean
        reason?: string
      }
      if (retried.ok === false && retried.reason) lastFinalizeFailure = retried.reason
    }
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

/**
 * One retry on a transient failure. The OpenRouter connection drops
 * occasionally and a whole route is too much to lose to a single blip.
 */
async function completeWithRetry(
  client: ChatClient,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<ChatToolCall[]> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const turn = await client.complete({ system: SYSTEM_PROMPT, messages, tools })
      return turn.toolCalls
    } catch (e) {
      lastError = e
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600))
    }
  }
  throw lastError
}
