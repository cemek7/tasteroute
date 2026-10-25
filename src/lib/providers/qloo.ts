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
    /** Qloo's own messages. They name the parameter it rejected. */
    readonly details: string[] = [],
  ) {
    super(
      details.length > 0
        ? `Qloo ${endpoint} returned ${status}: ${details.join('; ')}`
        : `Qloo ${endpoint} returned ${status}`,
    )
    this.name = 'QlooRequestError'
  }
}

/**
 * Qloo answers a bad request with `{"errors":[{"message":"...","path":"..."}]}`
 * — measured against the live host. An unresolvable city and a parameter we
 * built wrong both arrive as 400 and differ only in there, so the body is the
 * only way to tell them apart.
 */
async function readErrors(res: Response): Promise<string[]> {
  try {
    const body = (await res.json()) as { errors?: { message?: unknown }[] }
    if (!Array.isArray(body?.errors)) return []
    return body.errors
      .map((e) => (typeof e?.message === 'string' ? e.message : ''))
      .filter((m): m is string => m.length > 0)
  } catch {
    return []
  }
}

/**
 * Only this says the city is the problem. Anything else 400 is our bug, and
 * telling somebody their city does not exist because we sent a malformed
 * number would send them away for no reason.
 */
const saysLocalityUnresolved = (details: string[]) =>
  details.some((d) => /filter\.location/i.test(d) && /resolve|locality/i.test(d))

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
    if (!res.ok) throw new QlooRequestError(res.status, path, await readErrors(res))
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
    const c = q.constraints ?? {}
    const params = buildInsightsParams({
      'filter.type': 'urn:entity:place',
      // A radius needs a point, and a point replaces the locality name.
      'filter.location.query': c.radius ? undefined : q.locality,
      'filter.location': c.radius ? `POINT(${c.radius.lng} ${c.radius.lat})` : undefined,
      'filter.location.radius': c.radius?.metres,
      'filter.popularity.min': c.popularityMin,
      'filter.popularity.max': c.popularityMax,
      'filter.price_level.max': c.priceLevelMax,
      'filter.tags': c.requiredTags?.length ? c.requiredTags.join(',') : undefined,
      // Qloo UNIONS filter.tags by default. Measured live: halal plus a
      // wheelchair entrance returned a supermarket and a curtain shop
      // carrying neither. A requirement that ORs is not a requirement.
      'operator.filter.tags': c.requiredTags?.length ? 'intersection' : undefined,
      'filter.exclude.tags': c.excludeTags?.length ? c.excludeTags.join(',') : undefined,
      'signal.demographics.age': c.demographics?.ageBand,
      'signal.demographics.gender': c.demographics?.gender,
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
      if (
        e instanceof QlooRequestError &&
        e.status === 400 &&
        saysLocalityUnresolved(e.details)
      ) {
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
    primaryGenre: (p.primary_genre as { id?: string } | null | undefined)?.id ?? null,
    lat,
    lng,
    address: p.address ?? null,
    affinity: e.query?.affinity ?? null,
    popularity: e.popularity ?? null,
    priceLevel: typeof p.price_level === 'number' ? p.price_level : null,
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
    media: {
      imageUrl: (p.image as { url?: string } | null | undefined)?.url ?? undefined,
      imageUrls: imageUrls(p.images),
    },
    detail: {
      neighborhood: p.neighborhood ?? undefined,
      neighborhoodNote: firstSentence(p.neighborhood_description),
      about: firstSentence(p.overall_description),
      standout: firstSentence(p.unique_selling_points),
      rating: p.business_rating ?? undefined,
      phone: p.phone ?? undefined,
      website: p.website ?? undefined,
    },
  }
}

/**
 * `images` arrives as objects carrying a url, and sometimes as bare strings.
 * Anything we do not recognise is dropped rather than rendered.
 */
function imageUrls(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const urls = raw
    .map((i) => (typeof i === 'string' ? i : (i as { url?: unknown } | null)?.url))
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
  return urls.length > 0 ? urls : undefined
}

/** Qloo's prose fields are paragraphs; a card shows the first sentence. */
function firstSentence(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined
  const s = raw.trim().split(/(?<=\.)\s/)[0] ?? raw
  return s.replace(/\.$/, '').trim() || undefined
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

  // Qloo reports the same seed across several tiers — top3, top5, top10, all.
  // Every tier is true, so keep the WIDEST one: a candidate Qloo says the
  // seed influenced in the top ten is genuinely explained by it, and keeping
  // only the top three threw away most of what Qloo told us.
  const widest = new Map<string, { avgScore: number; topN: 3 | 5 | 10 | 'all' }>()
  const breadth = (t: 3 | 5 | 10 | 'all') => (t === 'all' ? Number.POSITIVE_INFINITY : t)

  for (const [key, topN] of TOP_N_KEYS) {
    for (const effect of block[key] ?? []) {
      const held = widest.get(effect.entity_id)
      if (!held || breadth(topN) > breadth(held.topN)) {
        widest.set(effect.entity_id, { avgScore: effect.avg_score, topN })
      }
    }
  }

  const signalEntities: ProviderExplainability['signalEntities'] = [...widest.entries()].map(
    ([entityId, v]) => ({
      entityId,
      avgScore: v.avgScore,
      topN: v.topN,
      // Filled by the caller, which is the only place that still holds the
      // candidate list this block was computed against.
      appliesTo: [],
    }),
  )

  return signalEntities.length > 0 ? { signalEntities } : null
}
