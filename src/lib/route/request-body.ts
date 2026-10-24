import { z } from 'zod'
import { normaliseWindow, type TimeWindow } from './window'
import type { RouteRequest } from '../providers/types'

const hour = z.number().int().min(0).max(24)

const bodySchema = z.object({
  city: z.string().trim().min(1).max(80),
  mood: z.string().trim().min(1).max(200),
  startHour: hour,
  endHour: hour,
})

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
    return { ok: false, error: 'Tell us a city and a mood to work from.' }
  }

  const timeWindow: TimeWindow = normaliseWindow(parsed.data.startHour, parsed.data.endHour)
  return {
    ok: true,
    value: { city: parsed.data.city, mood: parsed.data.mood, timeWindow },
  }
}
