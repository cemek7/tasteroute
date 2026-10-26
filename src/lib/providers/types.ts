import type {
  AccessibilityId,
  AgeBand,
  DietaryId,
  OccasionId,
  PartyComposition,
  Persona,
  VibeId,
} from '../intent/vocabulary'

/**
 * A part of a plan, not a time of day. `main` is the sit-down meal the rest
 * clusters around — lunch in a daytime plan, dinner in an evening one. The
 * chronological order lives in `route/phases.ts`, which is the only place
 * that decides which of these a given time window earns.
 */
export type SlotName =
  | 'morning'
  | 'activity'
  | 'open'
  | 'main'
  | 'afternoon'
  | 'close'
  | 'late'

/**
 * Everything optional a person can tell us. Split from the required three so
 * that the two halves of the system can each take exactly the object they
 * need: `constraintsFromIntent` for what our code enforces, and
 * `resolvePreferenceTags` for what the agent interprets.
 */
export type {
  AccessibilityId,
  AgeBand,
  DietaryId,
  OccasionId,
  PartyComposition,
  Persona,
  VibeId,
}

export type Intent = {
  vibe?: VibeId[]
  occasion?: OccasionId
  party?: { size: number; composition?: PartyComposition }
  persona?: Persona
  /** Never stored, never logged, never echoed back. */
  demographics?: { ageBand?: AgeBand; gender?: 'male' | 'female' }
  discovery?: number
  budget?: 1 | 2 | 3 | 4
  area?: { radiusMetres: number } | null
  /** Where the person actually is, if they let the browser tell us. */
  here?: { lat: number; lng: number }
  requirements?: { dietary?: DietaryId[]; accessibility?: AccessibilityId[] }
  avoid?: string[]
  seedPlaces?: string[]
  clarified?: { question: string; answer: string }
}

export type RouteRequest = {
  city: string
  mood: string
  timeWindow: { startHour: number; endHour: number }
  /** Always present, often empty. No call site can forget it exists. */
  intent: Intent
}

/**
 * What the app understood, and what it could not act on. The intake-side
 * counterpart to the trace panel: a person who asked for halal and got a
 * route without it is owed the reason, not a silent substitution.
 */
export type IntentEcho = {
  applied: { label: string; detail: string }[]
  ignored: { label: string; reason: string }[]
}

/**
 * The half of the intent our code enforces, expressed as Qloo parameters.
 * Declared here rather than in intent/qloo-params so the module graph runs
 * one way: intent depends on providers, never the reverse.
 */
export type HardConstraints = {
  popularityMin?: number
  popularityMax?: number
  priceLevelMax?: number
  radius?: { lat: number; lng: number; metres: number }
  requiredTags?: string[]
  excludeTags?: string[]
  demographics?: { ageBand?: string; gender?: string }
}

export type Locality = {
  name: string
  qlooLocalityId?: string
  centroid?: { lat: number; lng: number }
}

export type Tag = {
  id: string
  name: string
  type: string
  popularity: number
}

export type EntityRef = {
  entityId: string
  name: string
}

export type PlaceQuery = {
  locality: string
  tags?: { id: string; weight?: number }[]
  entities?: string[]
  take?: number
  /** Hard constraints, applied by our code and invisible to the agent. */
  constraints?: HardConstraints
}

export type Candidate = {
  id: string
  name: string
  category: string | null
  /** Qloo's own single classification, e.g. urn:tag:genre:place:cocktail_bar. */
  primaryGenre: string | null
  lat: number | null
  lng: number | null
  address: string | null
  affinity: number | null
  popularity: number | null
  /**
   * Qloo's 1-4 price level, when it published one. About four places in five
   * have none, so `null` and absent both mean "unknown", never "cheap".
   */
  priceLevel?: number | null
  isClosed: boolean | null
  hours: unknown | null
  tags: Tag[]
  descriptors: {
    goodFor?: string
    ambience?: string
    cuisine?: string
    cost?: string
    liveMusic?: string
    rating?: number
  }
  providerRank: number
  providerRef: { provider: 'qloo' | 'fixture'; entityId: string }
  /** Photos Qloo hosts. Absent is absent: no placeholders. */
  media?: { imageUrl?: string; imageUrls?: string[] }
  /** Everything else a card shows, already in the response we pay for. */
  detail?: {
    neighborhood?: string
    neighborhoodNote?: string
    about?: string
    standout?: string
    rating?: number
    phone?: string
    website?: string
    openTonight?: boolean | null
  }
}

export type ProviderExplainability = {
  signalEntities: {
    entityId: string
    avgScore: number
    topN: 3 | 5 | 10 | 'all'
    /**
     * The candidate ids this signal actually explains, taken from the very
     * response that carried the explainability block. Qloo's effect_on_topN
     * is relative to one response, so a rank from a later query says nothing
     * about it.
     */
    appliesTo: string[]
  }[]
}

export type PlaceResult = {
  candidates: Candidate[]
  explainability: ProviderExplainability | null
  warnings: string[]
}

export interface TasteProvider {
  readonly kind: 'qloo' | 'fixture'
  findTags(query: string): Promise<Tag[]>
  seedEntities(names: string[]): Promise<EntityRef[]>
  suggestPlaces(q: PlaceQuery): Promise<PlaceResult>
}

export type EvidenceKind =
  | 'explainability'
  | 'tag'
  | 'affinity'
  | 'descriptor'
  | 'popularity'

export type Evidence = {
  kind: EvidenceKind
  label: string
  value?: string | number
  source: 'qloo'
}

export type Stop = {
  /** 1-based position in the plan. A plan has three to five stops. */
  order: number
  slot: SlotName
  candidate: Candidate
  why: string
  evidence: Evidence[]
  walkFromPrev?: { metres: number; minutes: number }
}

export type Confidence = 'strong' | 'ok' | 'weak'

export type TraceEntry = {
  at: string
  tool: string
  argsSummary: string
  resultSummary: string
  ms: number
}

export type Route = {
  id: string
  locality: Locality
  mood: string
  createdAt: string
  /** Three to five, in chronological order. */
  stops: Stop[]
  confidence: Confidence
  alternatives: Candidate[]
  trace: TraceEntry[]
  providerKind: 'qloo' | 'fixture'
  unfilledSlots: SlotName[]
  /** What the app understood from the intent, and what it could not apply. */
  intentEcho: IntentEcho
  /** One sentence about the shape of the evening, composed from facts. */
  narrative: { line: string; evidence: Evidence[] }
  /** Kept so a swap can rebuild the narrative without the original request. */
  narrativeWindow: { startHour: number; endHour: number }
  /** Scored runners-up per slot, already filtered so a swap stays valid.
   *  Only the phases this plan actually has are present. */
  alternativesBySlot: Partial<Record<SlotName, Candidate[]>>
}
