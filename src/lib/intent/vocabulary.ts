export const VIBE_IDS = [
  'lively',
  'quiet',
  'intimate',
  'upscale',
  'casual',
  'outdoor',
] as const
export type VibeId = (typeof VIBE_IDS)[number]

export const OCCASION_IDS = [
  'date_night',
  'first_date',
  'birthday',
  'anniversary',
  'celebration',
  'catching_up',
  'work_dinner',
  'solo_night',
] as const
export type OccasionId = (typeof OCCASION_IDS)[number]

export const PARTY_COMPOSITIONS = [
  'solo',
  'couple',
  'friends',
  'family',
  'colleagues',
] as const
export type PartyComposition = (typeof PARTY_COMPOSITIONS)[number]

export const PERSONAS = ['newcomer', 'local', 'visiting'] as const
export type Persona = (typeof PERSONAS)[number]

/**
 * Qloo's own bands. `25_and_younger` looks plausible and returns zero
 * results; the real value is `24_and_younger`.
 */
export const AGE_BANDS = [
  '24_and_younger',
  '25_to_29',
  '30_to_34',
  '35_to_44',
  '45_to_54',
  '55_and_older',
] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export const DIETARY_IDS = ['halal', 'vegetarian', 'vegan', 'gluten_free', 'kosher'] as const
export type DietaryId = (typeof DIETARY_IDS)[number]

/**
 * Exactly the accessibility tags Qloo publishes, confirmed live. There is no
 * step-free tag — a query for "step free" returns parking and wifi — so the
 * product does not offer one. Offering an option that silently maps to
 * something else is worse than not offering it.
 */
export const ACCESSIBILITY_IDS = [
  'wheelchair_entrance',
  'wheelchair_restroom',
  'wheelchair_seating',
  'wheelchair_elevator',
  'wheelchair_parking',
] as const
export type AccessibilityId = (typeof ACCESSIBILITY_IDS)[number]

/** Requirements resolve to fixed URNs, confirmed against the live host. */
export const DIETARY_TAGS: Record<DietaryId, string> = {
  halal: 'urn:tag:dietary_option:qloo:halal',
  vegetarian: 'urn:tag:dietary_option:qloo:vegetarian',
  vegan: 'urn:tag:dietary_option:qloo:vegan',
  gluten_free: 'urn:tag:dietary_option:qloo:gluten_free',
  kosher: 'urn:tag:dietary_option:qloo:kosher',
}

export const ACCESSIBILITY_TAGS: Record<AccessibilityId, string> = {
  wheelchair_entrance: 'urn:tag:accessibility:place:wheelchair_accessible_entrance',
  wheelchair_restroom: 'urn:tag:accessibility:place:wheelchair_accessible_restroom',
  wheelchair_seating: 'urn:tag:accessibility:place:wheelchair_accessible_seating',
  wheelchair_elevator: 'urn:tag:accessibility:place:wheelchair_accessible_elevator',
  wheelchair_parking: 'urn:tag:accessibility:place:wheelchair_accessible_parking_lot',
}

/**
 * Preferences resolve by QUERYING Qloo's tag endpoint at runtime, so the
 * vocabulary stays Qloo's rather than ours. These are the search terms, not
 * the answers.
 */
export const VIBE_QUERIES: Record<VibeId, string[]> = {
  lively: ['lively'],
  quiet: ['quiet'],
  intimate: ['intimate', 'romantic'],
  upscale: ['upscale'],
  casual: ['casual'],
  outdoor: ['outdoor'],
}

export const OCCASION_QUERIES: Record<OccasionId, string[]> = {
  date_night: ['date'],
  first_date: ['first date'],
  birthday: ['birthday'],
  anniversary: ['anniversary'],
  celebration: ['celebration'],
  catching_up: ['groups'],
  work_dinner: ['business'],
  solo_night: ['solo'],
}

export const PARTY_QUERIES: Record<PartyComposition, string[]> = {
  solo: ['solo'],
  couple: ['couples'],
  friends: ['groups'],
  family: ['family'],
  colleagues: ['business'],
}
