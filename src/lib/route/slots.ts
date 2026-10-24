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

function isLodging(c: Candidate): boolean {
  const vocabulary = words(
    [c.category ?? '', ...c.tags.map((t) => `${t.id} ${t.name}`), c.name].join(' '),
  )
  return LODGING.some((n) => vocabulary.has(n))
}

/**
 * Ordered most specific first. Qloo nests its genre URNs, so a cocktail bar
 * is `urn:tag:genre:place:restaurant:cocktail_bar` — the substring
 * "restaurant" is present on venues that are emphatically not dinner. The
 * first entry that matches wins, which is what keeps a bar out of the main
 * slot.
 */
const MARKERS: { slot: SlotName; needles: string[]; weight: number }[] = [
  { slot: 'close', needles: ['cocktail_bar', 'nightclub', 'night_club', 'wine_bar', 'sports_bar'], weight: 1 },
  { slot: 'close', needles: ['lounge', 'nightlife', 'speakeasy', 'pub', 'bar', 'nightclub'], weight: 0.9 },
  { slot: 'open', needles: ['cafe', 'coffee', 'tea_room'], weight: 1 },
  { slot: 'open', needles: ['bakery', 'patisserie', 'dessert', 'ice_cream'], weight: 0.9 },
  { slot: 'open', needles: ['gallery', 'museum', 'bookstore'], weight: 0.8 },
  { slot: 'main', needles: ['restaurant', 'grill', 'kitchen', 'steakhouse', 'diner', 'eatery', 'barbecue', 'barbeque', 'bbq'], weight: 1 },
  { slot: 'main', needles: ['cuisine', 'bowling', 'cinema', 'theater', 'theatre'], weight: 0.8 },
]

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

function matchIn(text: string): { slot: SlotName; weight: number } | null {
  const vocabulary = words(text)
  for (const marker of MARKERS) {
    if (marker.needles.some((n) => vocabulary.has(n))) {
      return { slot: marker.slot, weight: marker.weight }
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
function primarySlot(c: Candidate): { slot: SlotName; weight: number } | null {
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
  const primary = primarySlot(c)
  if (!primary || primary.slot !== slot) return 0
  return primary.weight
}

export function slotsFor(c: Candidate): SlotName[] {
  const primary = primarySlot(c)
  return primary ? [primary.slot] : []
}
