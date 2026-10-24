import { z } from 'zod'
import {
  ACCESSIBILITY_IDS,
  DIETARY_IDS,
  OCCASION_IDS,
  PARTY_COMPOSITIONS,
  PERSONAS,
  VIBE_IDS,
} from './vocabulary'
import type { Intent } from '../providers/types'

export const PREFERENCES_KEY = 'tasteroute.preferences.v1'

/**
 * What is worth remembering between nights out. Deliberately absent:
 * demographics, which are not kept even on the device; and city, mood, the
 * time window, seedPlaces and clarified, which change every time.
 *
 * This is a convenience in one browser, not a profile. Nothing identifying is
 * stored, it never leaves the machine, and there is a button to clear it.
 */
const storedSchema = z.object({
  version: z.literal(1),
  vibe: z.array(z.enum(VIBE_IDS)).max(6).optional(),
  occasion: z.enum(OCCASION_IDS).optional(),
  party: z
    .object({
      size: z.number().int().min(1).max(40),
      composition: z.enum(PARTY_COMPOSITIONS).optional(),
    })
    .optional(),
  persona: z.enum(PERSONAS).optional(),
  discovery: z.number().min(0).max(1).optional(),
  budget: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  requirements: z
    .object({
      dietary: z.array(z.enum(DIETARY_IDS)).max(5).optional(),
      accessibility: z.array(z.enum(ACCESSIBILITY_IDS)).max(3).optional(),
    })
    .optional(),
  avoid: z.array(z.string().min(1).max(40)).max(8).optional(),
})

export function savePreferences(intent: Intent): void {
  try {
    const { vibe, occasion, party, persona, discovery, budget, requirements, avoid } = intent
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        vibe,
        occasion,
        party,
        persona,
        discovery,
        budget,
        requirements,
        avoid,
      }),
    )
  } catch {
    // Private browsing, or storage refused. Remembering is a convenience and
    // its absence must not break anything.
  }
}

export function loadPreferences(): Intent {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return {}
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    // A stale or hand-edited blob is discarded whole. Loading half of it into
    // the form would be worse than loading none of it.
    if (!parsed.success) return {}
    const { version: _version, ...intent } = parsed.data
    return intent
  } catch {
    return {}
  }
}

export function forgetPreferences(): void {
  try {
    localStorage.removeItem(PREFERENCES_KEY)
  } catch {
    // Nothing to do; it was never stored.
  }
}
