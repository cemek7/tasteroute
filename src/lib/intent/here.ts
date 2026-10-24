import { z } from 'zod'

/**
 * A position the person's browser gave us.
 *
 * 0,0 is rejected: it is in the Gulf of Guinea and is almost always a
 * default-initialised value rather than somewhere anybody is standing. The
 * same placeholder is used internally for "centre not yet resolved", so
 * letting it through would be indistinguishable from a bug.
 */
export const coordsSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .refine((c) => c.lat !== 0 || c.lng !== 0, {
    message: 'that is not a position anybody is standing in',
  })

export type Coords = z.infer<typeof coordsSchema>

export function labelForHere(metres: number): string {
  return `within ${(metres / 1000).toFixed(1)}km of where you are`
}
