import { assessSignal } from '../route/assess'
import { buildRoute } from '../route/build'
import type {
  Candidate,
  EntityRef,
  HardConstraints,
  Locality,
  ProviderExplainability,
  Route,
  RouteRequest,
  SlotName,
  TasteProvider,
  TraceEntry,
} from '../providers/types'

export type ToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'find_tags',
      description:
        'Turn a mood word or phrase into real Qloo tag ids. Call this first, and more than once if the mood has several parts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'One mood word, e.g. "cocktail" or "quiet"',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'seed_entities',
      description:
        'Resolve named places the user already likes into Qloo entity ids. Seeding with entities is the only way Qloo will return explainability, so use it when the user names somewhere.',
      parameters: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
        required: ['names'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_places',
      description:
        'Ask Qloo for places in the chosen city, filtered by tag ids and optionally seeded with entity ids. Results are added to the candidate pool. Returns a signal assessment: if it says weak, call again with broader or different tags.',
      parameters: {
        type: 'object',
        properties: {
          tagIds: { type: 'array', items: { type: 'string' } },
          entityIds: { type: 'array', items: { type: 'string' } },
          take: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_route',
      description:
        'Build the route from everything gathered so far. TasteRoute chooses, scores and orders the three stops; you do not. Call this once the pool is good enough.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
]

/**
 * Plain-language queries that reliably find a venue for each slot. Used only
 * when the model's own taste search left a slot empty: a three-stop route
 * needs all three kinds of place, and that is our guarantee to make, not the
 * model's.
 */
const SLOT_QUERIES: Record<SlotName, string[]> = {
  open: ['cafe', 'coffee', 'bakery'],
  main: ['restaurant', 'cuisine'],
  close: ['cocktail bar', 'lounge', 'bar'],
}

export type AgentSession = {
  tools: ToolDefinition[]
  pool: Candidate[]
  trace: TraceEntry[]
  finalRoute: Route | null
  requestedTagIds: string[]
  dispatch(name: string, args: Record<string, unknown>): Promise<unknown>
  /** Searches for the named slots with canonical queries. Not model-facing. */
  backfillSlots(slots: SlotName[]): Promise<void>
  /** Replaces the hard constraints, for the relaxation path. Not model-facing. */
  setConstraints(next: HardConstraints): void
}

export function createSession(opts: {
  provider: TasteProvider
  request: RouteRequest
  locality: Locality
  /** Applied to every search. The agent has no way to reach or relax these. */
  constraints?: HardConstraints
}): AgentSession {
  const { provider, request, locality } = opts
  let constraints = opts.constraints ?? {}

  const pool: Candidate[] = []
  const trace: TraceEntry[] = []
  const requestedTagIds: string[] = []
  const seedNames: Record<string, string> = {}
  let explainability: ProviderExplainability | null = null
  let finalRoute: Route | null = null

  const addToPool = (candidates: Candidate[]): number => {
    const known = new Set(pool.map((c) => c.id))
    let added = 0
    for (const c of candidates) {
      if (known.has(c.id)) continue
      known.add(c.id)
      pool.push(c)
      added += 1
    }
    return added
  }

  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<{ result: unknown; summary: string }>
  > = {
    async find_tags(args) {
      const query = String(args.query ?? '')
      const tags = await provider.findTags(query)
      return {
        result: {
          tags: tags.map((t) => ({ id: t.id, name: t.name, popularity: t.popularity })),
        },
        summary: `${tags.length} tags for "${query}"`,
      }
    },

    async seed_entities(args) {
      const names = Array.isArray(args.names) ? args.names.map(String) : []
      const entities: EntityRef[] = await provider.seedEntities(names)
      for (const e of entities) seedNames[e.entityId] = e.name
      return {
        result: { entities },
        summary: `resolved ${entities.length} of ${names.length} named places`,
      }
    },

    async suggest_places(args) {
      const tagIds = Array.isArray(args.tagIds) ? args.tagIds.map(String) : []
      const entityIds = Array.isArray(args.entityIds) ? args.entityIds.map(String) : []
      for (const id of tagIds) if (!requestedTagIds.includes(id)) requestedTagIds.push(id)

      const res = await provider.suggestPlaces({
        locality: locality.name,
        tags: tagIds.map((id) => ({ id })),
        entities: entityIds,
        take: typeof args.take === 'number' ? args.take : 30,
        constraints,
      })
      if (res.explainability) {
        // Scope the block to the candidates of THIS response before storing
        // it, so a later query cannot inherit the claim.
        const topN = (n: 3 | 5 | 10 | 'all') =>
          res.candidates
            .slice(0, n === 'all' ? res.candidates.length : n)
            .map((c) => c.id)
        explainability = {
          signalEntities: res.explainability.signalEntities.map((sig) => ({
            ...sig,
            appliesTo: sig.appliesTo.length > 0 ? sig.appliesTo : topN(sig.topN),
          })),
        }
      }

      const added = addToPool(res.candidates)
      const assessment = assessSignal(pool)

      return {
        result: {
          added,
          poolSize: pool.length,
          names: res.candidates.slice(0, 8).map((c) => c.name),
          assessment: {
            confidence: assessment.confidence,
            reason: assessment.reason,
            perSlot: assessment.perSlot,
          },
          warnings: res.warnings,
        },
        summary: `+${added} places, pool ${pool.length}, signal ${assessment.confidence}`,
      }
    },

    async finalize_route() {
      if (pool.length === 0) {
        return {
          result: {
            ok: false,
            reason: 'No places have been gathered yet.',
            hint: 'Call suggest_places at least once before finalize_route.',
          },
          summary: 'refused: pool is empty',
        }
      }

      const built = buildRoute({
        candidates: pool,
        request,
        locality,
        requestedTagIds,
        explainability,
        seedNames,
        trace,
        providerKind: provider.kind,
      })

      if ('error' in built) {
        return {
          result: { ok: false, unfilledSlots: built.unfilledSlots, reason: built.reason },
          summary: `could not fill ${built.unfilledSlots.join(', ')}`,
        }
      }

      finalRoute = built
      return {
        result: {
          ok: true,
          confidence: built.confidence,
          stops: built.stops.map((s) => ({
            order: s.order,
            slot: s.slot,
            name: s.candidate.name,
            why: s.why,
          })),
        },
        summary: `route built, confidence ${built.confidence}`,
      }
    },
  }

  const session: AgentSession = {
    tools: TOOL_DEFINITIONS,
    pool,
    trace,
    get finalRoute() {
      return finalRoute
    },
    requestedTagIds,

    setConstraints(next) {
      constraints = next
    },

    async backfillSlots(slots) {
      const started = Date.now()
      const filled: string[] = []

      for (const slot of slots) {
        for (const query of SLOT_QUERIES[slot]) {
          const tags = await provider.findTags(query)
          if (tags.length === 0) continue
          const res = await provider.suggestPlaces({
            locality: locality.name,
            tags: tags.slice(0, 3).map((t) => ({ id: t.id })),
            take: 30,
            constraints,
          })
          addToPool(res.candidates)
          if (assessSignal(pool).perSlot[slot] > 0) {
            filled.push(slot)
            break
          }
        }
      }

      trace.push({
        at: new Date().toISOString(),
        tool: 'backfill_slots',
        argsSummary: JSON.stringify({ slots }),
        resultSummary: filled.length
          ? `filled ${filled.join(', ')}, pool ${pool.length}`
          : `found nothing for ${slots.join(', ')}`,
        ms: Date.now() - started,
      })
    },

    async dispatch(name, args) {
      const handler = handlers[name]
      if (!handler) throw new Error(`Unknown tool: ${name}`)
      const started = Date.now()
      const { result, summary } = await handler(args)
      trace.push({
        at: new Date().toISOString(),
        tool: name,
        argsSummary: JSON.stringify(args).slice(0, 200),
        resultSummary: summary,
        ms: Date.now() - started,
      })
      return result
    },
  }

  return session
}
