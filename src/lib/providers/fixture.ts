import type {
  Candidate,
  EntityRef,
  PlaceQuery,
  PlaceResult,
  Tag,
  TasteProvider,
} from './types'

const T = (id: string, name: string, type: string, popularity = 0.9): Tag => ({
  id,
  name,
  type,
  popularity,
})

export const FIXTURE_TAGS: Tag[] = [
  T('urn:tag:genre:place:restaurant:cocktail_bar', 'Cocktail Bar', 'urn:tag:genre:place', 0.99),
  T('urn:tag:offerings:place:cocktails', 'Cocktails', 'urn:tag:offerings:place', 0.99),
  T('urn:tag:offerings:place:live_music', 'Live Music', 'urn:tag:offerings:place', 0.95),
  T('urn:tag:genre:place:cafe', 'Cafe', 'urn:tag:genre:place', 0.97),
  T('urn:tag:genre:place:bakery', 'Bakery', 'urn:tag:genre:place', 0.9),
  T('urn:tag:genre:place:restaurant', 'Restaurant', 'urn:tag:genre:place', 0.99),
  T('urn:tag:genre:place:restaurant:nigerian', 'Nigerian Restaurant', 'urn:tag:genre:place', 0.93),
  T('urn:tag:genre:place:gallery', 'Art Gallery', 'urn:tag:genre:place', 0.84),
  T('urn:tag:genre:place:bar:lounge', 'Lounge', 'urn:tag:genre:place', 0.92),
  T('urn:tag:offerings:place:dessert', 'Dessert', 'urn:tag:offerings:place', 0.88),
  // Ambience, occasion and party families, mirroring the URNs observed on the
  // live host so preference resolution can be exercised without a network
  // call. Hand-written, like everything else here.
  T('urn:tag:ambience:qloo:lively', 'Lively', 'urn:tag:ambience:qloo', 0.96),
  T('urn:tag:ambience:qloo:quiet', 'Quiet', 'urn:tag:ambience:qloo', 0.94),
  T('urn:tag:ambience:qloo:intimate', 'Intimate', 'urn:tag:ambience:qloo', 0.92),
  T('urn:tag:ambience:qloo:romantic', 'Romantic', 'urn:tag:ambience:qloo', 0.91),
  T('urn:tag:ambience:qloo:upscale', 'Upscale', 'urn:tag:ambience:qloo', 0.9),
  T('urn:tag:ambience:qloo:casual', 'Casual', 'urn:tag:ambience:qloo', 0.93),
  T('urn:tag:ambience:qloo:outdoor', 'Outdoor', 'urn:tag:ambience:qloo', 0.89),
  T('urn:tag:event:place:date_night', 'Date Night', 'urn:tag:event:place', 0.9),
  T('urn:tag:good_for:qloo:first_date', 'First Date', 'urn:tag:good_for:qloo', 0.87),
  T('urn:tag:event:place:birthday', 'Birthday', 'urn:tag:event:place', 0.86),
  T('urn:tag:event:place:anniversary', 'Anniversary', 'urn:tag:event:place', 0.84),
  T('urn:tag:good_for:qloo:celebrations', 'Celebrations', 'urn:tag:good_for:qloo', 0.85),
  T('urn:tag:good_for:qloo:groups', 'Groups', 'urn:tag:good_for:qloo', 0.9),
  T('urn:tag:good_for:qloo:solo_dining', 'Solo Dining', 'urn:tag:good_for:qloo', 0.8),
  T('urn:tag:customer_identity:qloo:couples', 'Couples', 'urn:tag:customer_identity:qloo', 0.9),
  T('urn:tag:theme:qloo:family', 'Family', 'urn:tag:theme:qloo', 0.83),
  T('urn:tag:good_for:qloo:business', 'Business', 'urn:tag:good_for:qloo', 0.82),
]

const tag = (id: string): Tag => {
  const found = FIXTURE_TAGS.find((t) => t.id === id)
  if (!found) throw new Error(`fixture tag not defined: ${id}`)
  return found
}

type Seed = {
  id: string
  name: string
  category: string
  lat: number
  lng: number
  address: string
  affinity: number
  popularity: number
  tagIds: string[]
  descriptors: Candidate['descriptors']
}

const SEEDS: Seed[] = [
  {
    id: 'fx-cafe-neo',
    name: 'Cafe Nine',
    category: 'cafe',
    lat: 6.4281,
    lng: 3.4219,
    address: '9 Kofo Abayomi St, Victoria Island',
    affinity: 0.81,
    popularity: 0.72,
    tagIds: ['urn:tag:genre:place:cafe', 'urn:tag:ambience:qloo:quiet', 'urn:tag:ambience:qloo:casual'],
    descriptors: { goodFor: 'working, quiet mornings', ambience: 'calm, bright', cost: 'moderate', rating: 4.4 },
  },
  {
    id: 'fx-bakery-rise',
    name: 'Rise Bakehouse',
    category: 'bakery',
    lat: 6.4386,
    lng: 3.4312,
    address: '3 Musa Yar’Adua St, Victoria Island',
    affinity: 0.69,
    popularity: 0.64,
    tagIds: ['urn:tag:genre:place:bakery', 'urn:tag:offerings:place:dessert'],
    descriptors: { goodFor: 'pastries, a short stop', ambience: 'casual', cost: 'cheap', rating: 4.2 },
  },
  {
    id: 'fx-gallery-ember',
    name: 'Ember Gallery',
    category: 'gallery',
    lat: 6.4502,
    lng: 3.4386,
    address: '14 Awolowo Rd, Ikoyi',
    affinity: 0.74,
    popularity: 0.51,
    tagIds: ['urn:tag:genre:place:gallery'],
    descriptors: { goodFor: 'a slow look around', ambience: 'quiet, airy', cost: 'free', rating: 4.6 },
  },
  {
    id: 'fx-nok',
    name: 'Terrace Nine Kitchen',
    category: 'restaurant',
    lat: 6.4304,
    lng: 3.4265,
    address: '12A Akin Olugbade St, Victoria Island',
    affinity: 0.88,
    popularity: 0.83,
    tagIds: [
      'urn:tag:genre:place:restaurant',
      'urn:tag:genre:place:restaurant:nigerian',
      'urn:tag:ambience:qloo:intimate',
      'urn:tag:event:place:date_night',
      'urn:tag:customer_identity:qloo:couples',
    ],
    descriptors: { goodFor: 'dinner with friends', ambience: 'chic, outdoor seating', cuisine: 'West African', cost: 'expensive', rating: 4.5 },
  },
  {
    id: 'fx-yellow-chair',
    name: 'The Yellow Chair',
    category: 'restaurant',
    lat: 6.4335,
    lng: 3.4288,
    address: '2 Idowu Martins St, Victoria Island',
    affinity: 0.76,
    popularity: 0.7,
    tagIds: [
      'urn:tag:genre:place:restaurant',
      'urn:tag:ambience:qloo:lively',
      'urn:tag:good_for:qloo:groups',
    ],
    descriptors: { goodFor: 'a long table', ambience: 'loud, lively', cuisine: 'small plates', cost: 'moderate', rating: 4.1 },
  },
  {
    id: 'fx-closed-kitchen',
    name: 'Harbour Grill',
    category: 'restaurant',
    lat: 6.4412,
    lng: 3.4201,
    address: '7 Ozumba Mbadiwe Ave, Victoria Island',
    affinity: 0.91,
    popularity: 0.88,
    tagIds: ['urn:tag:genre:place:restaurant'],
    descriptors: { goodFor: 'dinner', ambience: 'formal', cost: 'expensive', rating: 4.7 },
  },
  {
    id: 'fx-bar-slate',
    name: 'Slate & Smoke',
    category: 'cocktail_bar',
    lat: 6.4319,
    lng: 3.4301,
    address: '21 Adeola Odeku St, Victoria Island',
    affinity: 0.86,
    popularity: 0.79,
    tagIds: [
      'urn:tag:genre:place:restaurant:cocktail_bar',
      'urn:tag:offerings:place:cocktails',
      'urn:tag:ambience:qloo:intimate',
      'urn:tag:good_for:qloo:first_date',
    ],
    descriptors: { goodFor: 'a late drink', ambience: 'dark, low-lit', cost: 'expensive', rating: 4.4 },
  },
  {
    id: 'fx-lounge-brass',
    name: 'Brass Room',
    category: 'lounge',
    lat: 6.4357,
    lng: 3.4334,
    address: '5 Saka Tinubu St, Victoria Island',
    affinity: 0.72,
    popularity: 0.66,
    tagIds: [
      'urn:tag:genre:place:bar:lounge',
      'urn:tag:offerings:place:live_music',
      'urn:tag:ambience:qloo:lively',
    ],
    descriptors: { goodFor: 'live sets', ambience: 'warm, busy', liveMusic: 'Thursday to Sunday', cost: 'moderate', rating: 4.3 },
  },
  {
    id: 'fx-bar-afterglow',
    name: 'Afterglow',
    category: 'cocktail_bar',
    lat: 6.4478,
    lng: 3.4412,
    address: '18 Bourdillon Rd, Ikoyi',
    affinity: 0.64,
    popularity: 0.58,
    tagIds: [
      'urn:tag:genre:place:restaurant:cocktail_bar',
      'urn:tag:offerings:place:live_music',
    ],
    descriptors: { goodFor: 'a quiet nightcap', ambience: 'intimate', cost: 'moderate', rating: 4.0 },
  },
  // Appended last so every rank above stays stable. Gives the main slot a
  // third open venue, which is what 'strong' coverage should mean.
  {
    id: 'fx-pepper-house',
    name: 'Pepper House',
    category: 'restaurant',
    lat: 6.4291,
    lng: 3.4247,
    address: '30 Adetokunbo Ademola St, Victoria Island',
    affinity: 0.71,
    popularity: 0.61,
    tagIds: ['urn:tag:genre:place:restaurant', 'urn:tag:genre:place:restaurant:nigerian'],
    descriptors: { goodFor: 'a quick plate of rice', ambience: 'plain, fast', cuisine: 'Nigerian', cost: 'cheap', rating: 4.0 },
  },
]

export const FIXTURE_CANDIDATES: Candidate[] = SEEDS.map((s, i) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  primaryGenre: `urn:tag:genre:place:${s.category}`,
  lat: s.lat,
  lng: s.lng,
  address: s.address,
  affinity: s.affinity,
  popularity: s.popularity,
  isClosed: s.id === 'fx-closed-kitchen' ? true : false,
  hours: null,
  tags: s.tagIds.map(tag),
  descriptors: s.descriptors,
  providerRank: i + 1,
  providerRef: { provider: 'fixture', entityId: s.id },
}))

export class FixtureProvider implements TasteProvider {
  readonly kind = 'fixture' as const

  async findTags(query: string): Promise<Tag[]> {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return FIXTURE_TAGS.filter(
      (t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    )
  }

  async seedEntities(names: string[]): Promise<EntityRef[]> {
    const wanted = names.map((n) => n.toLowerCase().trim()).filter(Boolean)
    return FIXTURE_CANDIDATES.filter((c) =>
      wanted.some((w) => c.name.toLowerCase().includes(w)),
    ).map((c) => ({ entityId: c.id, name: c.name }))
  }

  async suggestPlaces(q: PlaceQuery): Promise<PlaceResult> {
    const wantedTagIds = (q.tags ?? []).map((t) => t.id)
    let matched = wantedTagIds.length
      ? FIXTURE_CANDIDATES.filter((c) =>
          c.tags.some((t) => wantedTagIds.includes(t.id)),
        )
      : FIXTURE_CANDIDATES

    // Honour the popularity band so the engine's own tests can exercise it
    // without a network call.
    const c = q.constraints ?? {}
    if (c.popularityMax !== undefined) {
      matched = matched.filter((x) => (x.popularity ?? 1) <= c.popularityMax!)
    }
    if (c.popularityMin !== undefined) {
      matched = matched.filter((x) => (x.popularity ?? 0) >= c.popularityMin!)
    }

    const candidates = matched
      .slice(0, q.take ?? 50)
      .map((c, i) => ({ ...c, providerRank: i + 1 }))

    const seeded = q.entities ?? []
    return {
      candidates,
      explainability: seeded.length
        ? {
            signalEntities: seeded.map((entityId) => ({
              entityId,
              avgScore: 1,
              topN: 3 as const,
              appliesTo: candidates.slice(0, 3).map((c) => c.id),
            })),
          }
        : null,
      warnings: [],
    }
  }
}
