import type { Candidate, SlotName } from '../providers/types'

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
 * A venue gets one slot, decided by its own category first. Tags are only
 * consulted when Qloo gave us no category, because a tag list mixes what a
 * place IS with what it merely offers.
 */
function primarySlot(c: Candidate): { slot: SlotName; weight: number } | null {
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
  const fromGenre = matchIn(genreTags)
  if (fromGenre) return fromGenre

  const allTags = c.tags
    .map((t) => `${t.id} ${t.name}`)
    .join(' ')
    .toLowerCase()
  return matchIn(allTags)
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
