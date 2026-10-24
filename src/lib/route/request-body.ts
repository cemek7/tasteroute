import { z } from 'zod'
import {
  ACCESSIBILITY_IDS,
  AGE_BANDS,
  DIETARY_IDS,
  OCCASION_IDS,
  PARTY_COMPOSITIONS,
  PERSONAS,
  VIBE_IDS,
} from '../intent/vocabulary'
import { coordsSchema } from '../intent/here'
import { normaliseWindow, type TimeWindow } from './window'
import type { RouteRequest } from '../providers/types'

const hour = z.number().int().min(0).max(24)

/**
 * Everything optional. A body carrying only city, mood and the hours must
 * behave exactly as it did before any of this existed.
 */
const intentSchema = z.object({
  vibe: z.array(z.enum(VIBE_IDS)).max(6).optional(),
  occasion: z.enum(OCCASION_IDS).optional(),
  party: z
    .object({
      size: z.number().int().min(1).max(40),
      composition: z.enum(PARTY_COMPOSITIONS).optional(),
    })
    .optional(),
  persona: z.enum(PERSONAS).optional(),
  demographics: z
    .object({
      ageBand: z.enum(AGE_BANDS).optional(),
      gender: z.enum(['male', 'female']).optional(),
    })
    .optional(),
  discovery: z.number().min(0).max(1).optional(),
  budget: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  area: z
    .object({ radiusMetres: z.number().int().min(250).max(50_000) })
    .nullable()
    .optional(),
  here: coordsSchema.optional(),
  requirements: z
    .object({
      dietary: z.array(z.enum(DIETARY_IDS)).max(5).optional(),
      accessibility: z.array(z.enum(ACCESSIBILITY_IDS)).max(3).optional(),
    })
    .optional(),
  avoid: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  seedPlaces: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
  clarified: z
    .object({ question: z.string().max(200), answer: z.string().max(80) })
    .optional(),
})

const bodySchema = z
  .object({
    city: z.string().trim().min(1).max(80),
    mood: z.string().trim().min(1).max(200),
    startHour: hour,
    endHour: hour,
  })
  .and(intentSchema)

const INTENT_FIELDS = new Set([
  'vibe',
  'occasion',
  'party',
  'persona',
  'demographics',
  'discovery',
  'budget',
  'area',
  'requirements',
  'avoid',
  'seedPlaces',
  'clarified',
  'here',
])

export type ParseResult =
  | { ok: true; value: RouteRequest }
  | { ok: false; error: string }

/**
 * Validates and normalises a request body, and — importantly — translates
 * every failure into one sentence a person can act on. Zod's own messages
 * ("Too small: expected number to be >=1") are developer text and were
 * reaching the form.
 *
 * There is deliberately no rule that the end must come after the start:
 * 22:00 until 02:00 is an evening out, not a mistake.
 */
export function parseRouteBody(raw: unknown): ParseResult {
  const parsed = bodySchema.safeParse(raw)

  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '')))
    if (fields.has('city')) return { ok: false, error: 'Tell us which city you are in.' }
    if (fields.has('mood')) {
      return { ok: false, error: 'Tell us what kind of evening you want.' }
    }
    if (fields.has('startHour') || fields.has('endHour')) {
      return {
        ok: false,
        error: 'Start and end times have to be hours of the day, 0 to 24.',
      }
    }
    if ([...fields].some((f) => INTENT_FIELDS.has(f))) {
      return { ok: false, error: 'One of those preferences is not one we know.' }
    }
    return { ok: false, error: 'Tell us a city and a mood to work from.' }
  }

  const { city, mood, startHour, endHour, ...intent } = parsed.data
  const timeWindow: TimeWindow = normaliseWindow(startHour, endHour)
  return { ok: true, value: { city, mood, timeWindow, intent } }
}
