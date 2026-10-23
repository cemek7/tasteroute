export type SlotName = 'open' | 'main' | 'close'

export type RouteRequest = {
  city: string
  mood: string
  timeWindow: { startHour: number; endHour: number }
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
}

export type Candidate = {
  id: string
  name: string
  category: string | null
  lat: number | null
  lng: number | null
  address: string | null
  affinity: number | null
  popularity: number | null
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
  order: 1 | 2 | 3
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
  stops: [Stop, Stop, Stop]
  confidence: Confidence
  alternatives: Candidate[]
  trace: TraceEntry[]
  providerKind: 'qloo' | 'fixture'
  unfilledSlots: SlotName[]
}
