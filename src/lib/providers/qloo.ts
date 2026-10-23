import 'server-only'

import { buildInsightsParams, buildSearchParams, buildTagsParams } from './params'
import {
  qlooInsightsSchema,
  qlooSearchSchema,
  qlooTagsSchema,
  type QlooInsightsResponse,
} from './schemas'
import type {
  Candidate,
  EntityRef,
  PlaceQuery,
  PlaceResult,
  ProviderExplainability,
  Tag,
  TasteProvider,
} from './types'

export class UnknownLocalityError extends Error {
  constructor(locality: string) {
    super(`Qloo has no locality matching "${locality}". Try a larger nearby city.`)
    this.name = 'UnknownLocalityError'
  }
}

export class QlooRequestError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`Qloo ${endpoint} returned ${status}`)
    this.name = 'QlooRequestError'
  }
}

const MAX_TAKE = 50

const TOP_N_KEYS = [
  ['effect_on_top3_recs', 3],
  ['effect_on_top5_recs', 5],
  ['effect_on_top10_recs', 10],
  ['effect_on_all_recs', 'all'],
] as const

type QlooEntity = QlooInsightsResponse['results']['entities'][number]

export class QlooProvider implements TasteProvider {
  readonly kind = 'qloo' as const
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: { baseUrl?: string; apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl = (
      opts.baseUrl ??
      process.env.QLOO_API_BASE_URL ??
      'https://hackathon.api.qloo.com'
    ).replace(/\/$/, '')
    this.apiKey = opts.apiKey ?? process.env.QLOO_API_KEY ?? ''
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private async get(path: string, params: URLSearchParams): Promise<unknown> {
    const url = `${this.baseUrl}${path}?${params.toString()}`
    const res = await this.fetchImpl(url, {
      headers: { 'X-Api-Key': this.apiKey, accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new QlooRequestError(res.status, path)
    return res.json()
  }

  async findTags(query: string): Promise<Tag[]> {
    const params = buildTagsParams({ 'filter.query': query, take: 6 })
    const raw = await this.get('/v2/tags', params)
    const parsed = qlooTagsSchema.parse(raw)
    return parsed.results.tags.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      popularity: t.popularity ?? 0,
    }))
  }

  async seedEntities(names: string[]): Promise<EntityRef[]> {
    const found: EntityRef[] = []
    for (const name of names.slice(0, 5)) {
      const params = buildSearchParams({ query: name, take: 1 })
      const raw = await this.get('/search', params)
      const parsed = qlooSearchSchema.parse(raw)
      const list = Array.isArray(parsed.results)
        ? parsed.results
        : (parsed.results?.entities ?? [])
      const first = list[0]
      if (first) found.push({ entityId: first.entity_id, name: first.name })
    }
    return found
  }

  async suggestPlaces(q: PlaceQuery): Promise<PlaceResult> {
    const seeded = (q.entities ?? []).length > 0
    const params = buildInsightsParams({
      'filter.type': 'urn:entity:place',
      'filter.location.query': q.locality,
      'signal.interests.tags': q.tags?.length ? q.tags.map((t) => t.id).join(',') : undefined,
      'signal.interests.entities': seeded ? q.entities!.join(',') : undefined,
      // Qloo cannot compute explainability for tag signals, so only ask when seeded.
      'feature.explainability': seeded ? true : undefined,
      take: Math.min(q.take ?? 20, MAX_TAKE),
    })

    let raw: unknown
    try {
      raw = await this.get('/v2/insights', params)
    } catch (e) {
      if (e instanceof QlooRequestError && e.status === 400) {
        throw new UnknownLocalityError(q.locality)
      }
      throw e
    }

    const parsed = qlooInsightsSchema.parse(raw)
    return {
      candidates: parsed.results.entities.map(toCandidate),
      explainability: toExplainability(parsed),
      warnings: (parsed.warnings ?? []).map((w) => w.type),
    }
  }
}

function toCandidate(e: QlooEntity, index: number): Candidate {
  const p = e.properties ?? {}
  const geo = p.geocode as { latitude?: number | null; longitude?: number | null } | null | undefined
  const lat = geo?.latitude ?? e.location?.lat ?? null
  const lng = geo?.longitude ?? e.location?.lon ?? null

  return {
    id: e.entity_id,
    name: e.name,
    category: categoryOf(e.tags ?? []),
    lat,
    lng,
    address: p.address ?? null,
    affinity: e.query?.affinity ?? null,
    popularity: e.popularity ?? null,
    isClosed: p.is_closed ?? null,
    hours: p.hours ?? null,
    tags: (e.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      popularity: t.popularity ?? 0,
    })),
    // Qloo nulls absent properties; our descriptors are optional, not nullable.
    descriptors: {
      goodFor: goodForPhrase(p.good_for),
      ambience: p.ambience_description ?? undefined,
      cuisine: p.cuisine_description ?? undefined,
      cost: p.cost_description ?? undefined,
      liveMusic: p.live_music === true ? 'live music' : undefined,
      rating: p.business_rating ?? undefined,
    },
    providerRank: index + 1,
    providerRef: { provider: 'qloo', entityId: e.entity_id },
  }
}

/** Qloo's good_for is a tag array; render the names as one readable phrase. */
function goodForPhrase(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined
  const names = raw
    .map((t) => (t as { name?: unknown }).name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
  return names.length > 0 ? names.join(', ') : undefined
}

/**
 * The most specific genre tag is the closest thing Qloo gives to a category,
 * and Qloo lists them in no guaranteed order: a cocktail bar carries both
 * `...:place:restaurant` and `...:place:restaurant:cocktail_bar`. Depth, not
 * position, decides which one describes the venue.
 */
function categoryOf(tags: { id: string; type: string }[]): string | null {
  const genres = tags.filter((t) => t.type.startsWith('urn:tag:genre:place'))
  if (genres.length === 0) return null
  const deepest = genres.reduce((a, b) =>
    b.id.split(':').length > a.id.split(':').length ? b : a,
  )
  return deepest.id.split(':').at(-1) ?? null
}

function toExplainability(parsed: QlooInsightsResponse): ProviderExplainability | null {
  const block = parsed.query?.explainability?.['signal.interests.entities']
  if (!block) return null

  const signalEntities: ProviderExplainability['signalEntities'] = []
  const seen = new Set<string>()
  for (const [key, topN] of TOP_N_KEYS) {
    for (const effect of block[key] ?? []) {
      if (seen.has(effect.entity_id)) continue
      seen.add(effect.entity_id)
      signalEntities.push({
        entityId: effect.entity_id,
        avgScore: effect.avg_score,
        topN,
        // Filled by the caller, which is the only place that still holds the
        // candidate list this block was computed against.
        appliesTo: [],
      })
    }
  }
  return signalEntities.length > 0 ? { signalEntities } : null
}
