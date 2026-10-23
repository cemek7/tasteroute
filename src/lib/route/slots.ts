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
  const haystack = [c.category ?? '', ...c.tags.map((t) => `${t.id} ${t.name}`), c.name]
    .join(' ')
    .toLowerCase()
  return LODGING.some((n) => haystack.includes(n))
}

/**
 * Ordered most specific first. Qloo nests its genre URNs, so a cocktail bar
 * is `urn:tag:genre:place:restaurant:cocktail_bar` — the substring
 * "restaurant" is present on venues that are emphatically not dinner. The
 * first entry that matches wins, which is what keeps a bar out of the main
 * slot.
 */
const MARKERS: { slot: SlotName; needles: string[]; weight: number }[] = [
  { slot: 'close', needles: ['cocktail_bar', 'nightclub', 'night_club'], weight: 1 },
  { slot: 'close', needles: ['lounge', 'nightlife', 'speakeasy', 'pub', 'bar', 'club'], weight: 0.9 },
  { slot: 'open', needles: ['cafe', 'coffee', 'tea_room'], weight: 1 },
  { slot: 'open', needles: ['bakery', 'patisserie', 'dessert', 'ice_cream'], weight: 0.9 },
  { slot: 'open', needles: ['gallery', 'museum', 'bookstore'], weight: 0.8 },
  { slot: 'main', needles: ['restaurant', 'grill', 'kitchen', 'steakhouse', 'diner', 'eatery'], weight: 1 },
  { slot: 'main', needles: ['cuisine', 'bowling', 'cinema', 'theater', 'theatre'], weight: 0.8 },
]

function matchIn(text: string): { slot: SlotName; weight: number } | null {
  for (const marker of MARKERS) {
    if (marker.needles.some((n) => text.includes(n))) {
      return { slot: marker.slot, weight: marker.weight }
    }
  }
  return null
}

/**
 * A venue gets one slot, decided by its own category first, then by its genre
 * tags. Offering tags are deliberately NOT consulted: a hotel that serves
 * coffee is not a cafe, and that is exactly how hotels were getting in.
 */
function primarySlot(c: Candidate): { slot: SlotName; weight: number } | null {
  if (isLodging(c)) return null

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
