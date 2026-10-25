import { Budget, DEFAULT_MAX_ROUNDS } from './budget'
import { trimForBudget } from './spend'
import { createSession, resolvePreferenceTags, type ToolDefinition } from './tools'
import { resolveAvoidTags } from '../intent/avoid'
import { CONSTRAINT_LABELS } from '../intent/labels'
import { cityCentre, RELAX_LABELS, relaxOnce } from '../intent/relax'
import { QlooRequestError, UnknownLocalityError } from '../providers/qloo'
import type {
  HardConstraints,
  IntentEcho,
  Locality,
  Route,
  RouteRequest,
  SlotName,
  TasteProvider,
  TraceEntry,
} from '../providers/types'

/** Spec cap: a single round never sends more than this much input. */
export const DEFAULT_MAX_INPUT_TOKENS = 12_000

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
  maxInputTokens?: number
  constraints?: HardConstraints
}

export type PlanResult =
  | { route: Route; roundsUsed: number; ignored: IntentEcho['ignored'] }
  | { error: string; trace: TraceEntry[] }

export async function planRoute(opts: PlanOptions): Promise<PlanResult> {
  const { provider, request, locality, client } = opts
  const budget = new Budget(opts.maxRounds ?? DEFAULT_MAX_ROUNDS)
  const maxInputTokens = opts.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS
  const ignored: IntentEcho['ignored'] = []

  let constraints = opts.constraints ?? {}
  // A radius arrives without a centre, because only something holding a
  // provider can find one. The placeholder must never reach a real query.
  if (constraints.radius && constraints.radius.lat === 0 && constraints.radius.lng === 0) {
    const centre = await cityCentre(provider, locality.name)
    if (centre) {
      constraints = { ...constraints, radius: { ...constraints.radius, ...centre } }
    } else {
      constraints = { ...constraints, radius: undefined }
      ignored.push({
        label: RELAX_LABELS.radius,
        reason: 'we could not place the centre of this city, so the whole city was searched',
      })
    }
  }

  // `avoid` arrives as free text. Qloo ignores a bare word in
  // filter.exclude.tags, so it has to be resolved to URNs or it is a promise
  // we cannot keep. Anything unresolvable is reported rather than dropped.
  if (constraints.excludeTags?.length) {
    const resolvedAvoid = await resolveAvoidTags(provider, constraints.excludeTags)
    constraints = {
      ...constraints,
      excludeTags: resolvedAvoid.tagIds.length > 0 ? resolvedAvoid.tagIds : undefined,
    }
    if (resolvedAvoid.unresolved.length > 0) {
      ignored.push({
        label: CONSTRAINT_LABELS.excludeTags,
        reason: `Qloo has no tag for ${resolvedAvoid.unresolved.join(', ')}, so it could not be excluded`,
      })
    }
  }

  const session = createSession({ provider, request, locality, constraints })

  // Places the person named. Seeding with entities is the ONLY way Qloo
  // returns its own explainability, which is the strongest reason a stop can
  // carry — so this runs whether or not the model thinks to do it.
  let seededEntityIds: string[] = []
  if (request.intent.seedPlaces?.length) {
    try {
      const found = (await session.dispatch('seed_entities', {
        names: request.intent.seedPlaces,
      })) as { entities?: { entityId: string; name: string }[] }
      seededEntityIds = (found.entities ?? []).map((e) => e.entityId)
      // Qloo answers "BluCabana" with "BluCabana Restaurant & Cafe", so an
      // exact comparison reported a found place as missing.
      const foundNames = (found.entities ?? []).map((e) => e.name.toLowerCase())
      const missed = request.intent.seedPlaces.filter((n) => {
        const want = n.toLowerCase().trim()
        return !foundNames.some((f) => f.includes(want) || want.includes(f))
      })
      if (missed.length > 0) {
        ignored.push({
          label: 'Places you like',
          reason: `Qloo could not find ${missed.join(', ')}, so it did not shape the search`,
        })
      }
    } catch (e) {
      if (e instanceof UnknownLocalityError) {
        return { error: e.message, trace: session.trace }
      }
      // Reported, not swallowed. This threw for weeks on a schema mismatch
      // and the only symptom was that naming a place you liked did nothing.
      console.error('seed lookup failed', (e as Error).message)
      ignored.push({
        label: 'Places you like',
        reason: 'the lookup failed, so what you named did not shape the search',
      })
    }
  }

  // Resolve the stated preferences into real Qloo tags and seed the pool with
  // them, so the agent spends its rounds refining rather than rediscovering
  // what the person already told us.
  const preferences = await resolvePreferenceTags(provider, request.intent)
  if (preferences.tagIds.length > 0 || seededEntityIds.length > 0) {
    try {
      await session.dispatch('suggest_places', {
        tagIds: preferences.tagIds,
        entityIds: seededEntityIds,
      })
    } catch (e) {
      if (e instanceof UnknownLocalityError) {
        return { error: e.message, trace: session.trace }
      }
    }
  }

  const clarified = request.intent.clarified
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content:
        `City: ${request.city}\nMood: ${request.mood}\n` +
        `Out between ${request.timeWindow.startHour}:00 and ${request.timeWindow.endHour}:00.` +
        // Prose for the model to interpret. It is never treated as an id.
        (clarified ? `\nAsked: ${clarified.question}\nAnswered: ${clarified.answer}` : ''),
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
      toolCalls = await completeWithRetry(
        client,
        trimForBudget(messages, maxInputTokens),
        session.tools,
      )
    } catch (e) {
      console.error('planner call failed', (e as Error).message)
      return { error: planErrorMessage(e), trace: session.trace }
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
  // and go straight to finalize. Rescue all three rather than returning
  // nothing.
  if (!session.finalRoute) {
    if (session.pool.length === 0) {
      try {
        // Untagged on purpose. An empty pool means the tagged searches
        // returned nothing, so retrying them would fail the same way.
        await session.dispatch('suggest_places', {})
      } catch (e) {
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
        console.error('rescue search failed', (e as Error).message)
        // A 400 means Qloo answered and rejected the query, so saying it
        // could not be reached would be untrue.
        const rejected = e instanceof QlooRequestError && e.status === 400
        return {
          error: rejected
            ? `Qloo rejected the search for ${locality.name}. This is a fault on our side, not yours.`
            : `Qloo could not be reached for ${locality.name}. Try again in a moment.`,
          trace: session.trace,
        }
      }
    }

    let outcome = (await session.dispatch('finalize_route', {})) as {
      ok?: boolean
      reason?: string
      unfilledSlots?: SlotName[]
    }
    if (outcome.ok === false && outcome.reason) lastFinalizeFailure = outcome.reason

    // Order matters here. A finalize can fail for slot coverage while the
    // pool is perfectly good — thirty halal restaurants and no cafe — and
    // giving up the dietary requirement would not have helped. So cover the
    // slots first, searching for each missing kind WITH the constraints
    // applied.
    if (!session.finalRoute && outcome.unfilledSlots?.length) {
      try {
        await session.backfillSlots(outcome.unfilledSlots)
      } catch (e) {
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
      }
      outcome = (await session.dispatch('finalize_route', {})) as typeof outcome
      if (outcome.ok === false && outcome.reason) lastFinalizeFailure = outcome.reason
    }

    // Only now. Backfill has looked for every missing kind with the
    // constraints applied and still come up short, so a constraint really is
    // the reason. Give one up at a time, softest first, and record each so
    // the person is told rather than left guessing.
    while (!session.finalRoute) {
      const relaxed = relaxOnce(constraints)
      if (!relaxed) break
      ignored.push({
        label: RELAX_LABELS[relaxed.dropped] ?? String(relaxed.dropped),
        reason: relaxed.droppedDetail
          ? `nothing matched with ${relaxed.droppedDetail} applied, so it was relaxed`
          : 'nothing matched with this applied, so it was relaxed',
      })
      constraints = relaxed.next
      session.setConstraints(constraints)
      try {
        await session.dispatch('suggest_places', {
          tagIds: session.requestedTagIds.slice(0, 5),
        })
        if (!session.finalRoute && outcome.unfilledSlots?.length) {
          await session.backfillSlots(outcome.unfilledSlots)
        }
      } catch (e) {
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
      }
      outcome = (await session.dispatch('finalize_route', {})) as typeof outcome
      if (outcome.ok === false && outcome.reason) lastFinalizeFailure = outcome.reason
    }
  }

  const route = session.finalRoute
  if (!route) {
    return {
      error: lastFinalizeFailure ?? 'Not enough places came back to build a three-stop route.',
      trace: session.trace,
    }
  }

  // The session built the route before any relaxation was known, so the
  // requirement downgrade has to be applied here. A route that could not
  // honour a stated dietary or accessibility need is not a confident route,
  // whatever the taste match looks like.
  const requirementDropped = ignored.some((i) => i.label === RELAX_LABELS.requiredTags)

  return {
    route: {
      ...route,
      trace: session.trace,
      confidence: requirementDropped ? 'weak' : route.confidence,
      intentEcho: {
      applied: [...route.intentEcho.applied, ...preferences.applied],
      ignored,
    },
    },
    roundsUsed: budget.roundsUsed,
    ignored,
  }
}

/**
 * Turn whatever the SDK or Qloo threw into one sentence a person can read. A
 * raw ZodError is a multi-line dump of issue objects and belongs in the log.
 */
function planErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/zod|invalid_type|invalid input/i.test(raw) || raw.includes('\n')) {
    return 'Qloo returned something TasteRoute could not read. Try again in a moment.'
  }
  if (/401|403|api key/i.test(raw)) {
    return 'The planner is not configured correctly. This is our problem, not yours.'
  }
  if (/402|credit|quota|insufficient/i.test(raw)) {
    return 'The planner has run out of credit for now. Try again later.'
  }
  return `The planner could not be reached: ${raw}`
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
