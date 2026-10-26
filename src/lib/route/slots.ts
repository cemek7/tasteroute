import type { Candidate, SlotName } from '../providers/types'

/**
 * Somewhere you sleep is not a stop on a night out. Qloo's Lagos results are
 * full of hotels and serviced apartments, and many carry a cafe or bar
 * offering tag, so they must be excluded before any slot matching happens.
 */
const LODGING = [
  'hotel',
  'motel',
  'hostel',
  'resort',
  'apartment',
  'guest_house',
  'guesthouse',
  'lodging',
  'residence',
  'residencia',
  'villa',
  'bed_and_breakfast',
]

/**
 * Genres that look like a going-out kind but are not, confirmed by querying
 * the live host: a search for "club" returns `sports_club` and
 * `soccer_club`, "park" returns `park_ride`, and "market" returns
 * `market_researcher`. Each of those shares a word with a kind below, so
 * without this list a five-a-side pitch becomes the last stop of the night.
 */
const NOT_GOING_OUT = [
  'sports_club',
  'soccer_club',
  'golf_club',
  'country_club',
  'health_club',
  'book_club',
  'yacht_club',
  'park_ride',
  'parking_lot',
  'car_park',
  'market_researcher',
  'supermarket',
  'hardware_store',
  'hunting_preserve',
  'fitness_center',
  'wedding_venue',
  'city_hall',
  'amusement_park_ride',
  'banquet_hall',
]

function isLodging(c: Candidate): boolean {
  const vocabulary = words(
    [c.category ?? '', ...c.tags.map((t) => `${t.id} ${t.name}`), c.name].join(' '),
  )
  return LODGING.some((n) => vocabulary.has(n))
}

/**
 * What a venue *is*. A phase then says which kinds it will take, which is
 * what lets one cafe serve either breakfast or the start of an evening —
 * the old one-slot-per-venue rule made that impossible.
 *
 * Ordered most specific first, and the first match wins. Qloo nests its
 * genre URNs, so a cocktail bar is
 * `urn:tag:genre:place:restaurant:cocktail_bar` and the substring
 * "restaurant" is present on venues that are emphatically not dinner.
 */
export type VenueKind =
  | 'cafe'
  | 'dessert'
  | 'culture'
  | 'activity'
  | 'restaurant'
  | 'bar'
  | 'club'

const KIND_MARKERS: { kind: VenueKind; needles: string[]; weight: number }[] = [
  { kind: 'club', needles: ['night_club', 'nightclub', 'dancing', 'discotheque', 'disco'], weight: 1 },
  { kind: 'club', needles: ['club'], weight: 0.9 },
  { kind: 'bar', needles: ['cocktail_bar', 'wine_bar', 'sports_bar'], weight: 1 },
  { kind: 'bar', needles: ['lounge', 'nightlife', 'speakeasy', 'pub', 'bar', 'brewery', 'taproom'], weight: 0.9 },
  { kind: 'cafe', needles: ['cafe', 'coffee', 'coffee_shop', 'tea_room', 'brunch', 'breakfast'], weight: 1 },
  { kind: 'dessert', needles: ['bakery', 'patisserie', 'dessert', 'ice_cream', 'juice_bar', 'smoothie'], weight: 0.9 },
  { kind: 'culture', needles: ['gallery', 'museum', 'bookstore', 'library', 'monument', 'landmark', 'theatre', 'theater', 'cultural_center', 'art_center', 'concert_hall'], weight: 0.9 },
  { kind: 'activity', needles: ['park', 'garden', 'zoo', 'aquarium', 'beach', 'market', 'bowling', 'cinema', 'arcade', 'spa', 'viewpoint', 'nature_preserve', 'amusement_center'], weight: 0.9 },
  { kind: 'restaurant', needles: ['restaurant', 'grill', 'kitchen', 'steakhouse', 'diner', 'eatery', 'barbecue', 'barbeque', 'bbq'], weight: 1 },
  { kind: 'restaurant', needles: ['cuisine'], weight: 0.8 },
]

/**
 * Which kinds each phase will take. A phase is a part of a plan, so the
 * question it asks is "would this place work here", not "what is this".
 */
const PHASE_KINDS: Record<SlotName, VenueKind[]> = {
  morning: ['cafe', 'dessert'],
  activity: ['culture', 'activity'],
  open: ['cafe', 'dessert', 'culture'],
  main: ['restaurant'],
  afternoon: ['activity', 'culture', 'cafe', 'dessert'],
  close: ['bar'],
  late: ['club', 'bar'],
}

/**
 * Split a category or a genre URN into comparable words. A bare substring
 * test is not safe here: "bar" is inside "barbecue", and "club" is inside
 * "golf_club", so a barbecue restaurant was being offered as the last drink
 * of the night.
 */
function words(text: string): Set<string> {
  const parts = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const out = new Set(parts)
  // Keep multi-word needles like "cocktail_bar" matchable by rejoining
  // adjacent words.
  for (let i = 0; i < parts.length - 1; i++) {
    out.add(`${parts[i]}_${parts[i + 1]}`)
  }
  return out
}

function matchIn(text: string): { kind: VenueKind; weight: number } | null {
  const vocabulary = words(text)
  if (NOT_GOING_OUT.some((n) => vocabulary.has(n))) return null
  for (const marker of KIND_MARKERS) {
    if (marker.needles.some((n) => vocabulary.has(n))) {
      return { kind: marker.kind, weight: marker.weight }
    }
  }
  return null
}

/**
 * A venue gets one slot, decided by Qloo's own `primary_genre` when it has
 * one, then by its category, then by its genre tags. Offering tags are
 * deliberately NOT consulted: a hotel that serves coffee is not a cafe, and
 * that is exactly how hotels were getting in.
 */
export function kindOf(c: Candidate): { kind: VenueKind; weight: number } | null {
  if (isLodging(c)) return null

  // Qloo's own classification first, when it gave us one. The famous end of
  // its catalogue is malls and hotels; the obscure end is housing estates,
  // car parks and offices. A deny-list cannot keep up with that, so a
  // classified place that matches no going-out kind is not one.
  if (c.primaryGenre) {
    const leaf = c.primaryGenre.replace('urn:tag:genre:place', '')
    return matchIn(leaf)
  }

  const category = (c.category ?? '').toLowerCase()
  if (category) {
    const fromCategory = matchIn(category)
    if (fromCategory) return fromCategory
  }

  const genreTags = c.tags
    .filter((t) => t.type.startsWith('urn:tag:genre'))
    .map((t) => `${t.id} ${t.name}`)
    .join(' ')
    .toLowerCase()
  return matchIn(genreTags)
}

export function slotFit(c: Candidate, slot: SlotName): number {
  const kind = kindOf(c)
  if (!kind || !PHASE_KINDS[slot].includes(kind.kind)) return 0
  return kind.weight
}

export function slotsFor(c: Candidate): SlotName[] {
  const kind = kindOf(c)
  if (!kind) return []
  return (Object.keys(PHASE_KINDS) as SlotName[]).filter((slot) =>
    PHASE_KINDS[slot].includes(kind.kind),
  )
}
