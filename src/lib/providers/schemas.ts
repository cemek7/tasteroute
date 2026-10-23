import { z } from 'zod'

const geocode = z
  .object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .loose()

const qlooTag = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  popularity: z.number().optional(),
})

const qlooEntity = z.object({
  entity_id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  subtype: z.string().optional(),
  popularity: z.number().optional(),
  location: z
    .object({ lat: z.number().optional(), lon: z.number().optional() })
    .loose()
    .optional(),
  tags: z.array(qlooTag).optional().default([]),
  properties: z
    .object({
      address: z.string().optional(),
      geocode: geocode.optional(),
      hours: z.unknown().optional(),
      business_rating: z.number().optional(),
      is_closed: z.boolean().optional(),
      good_for: z.string().optional(),
      keywords: z.unknown().optional(),
      ambience_description: z.string().optional(),
      cuisine_description: z.string().optional(),
      cost_description: z.string().optional(),
      live_music: z.string().optional(),
    })
    .loose()
    .optional()
    .default({}),
  query: z
    .object({
      affinity: z.number().optional(),
      distance: z.number().optional(),
    })
    .loose()
    .optional(),
})

const explainabilityEffect = z.array(
  z.object({ entity_id: z.string(), avg_score: z.number() }),
)

export const qlooInsightsSchema = z.object({
  success: z.boolean().optional(),
  warnings: z.array(z.object({ type: z.string() }).loose()).optional(),
  results: z
    .object({ entities: z.array(qlooEntity).optional().default([]) })
    .loose(),
  query: z
    .object({
      explainability: z
        .object({
          'signal.interests.entities': z
            .object({
              effect_on_top3_recs: explainabilityEffect.optional(),
              effect_on_top5_recs: explainabilityEffect.optional(),
              effect_on_top10_recs: explainabilityEffect.optional(),
              effect_on_all_recs: explainabilityEffect.optional(),
            })
            .loose()
            .optional(),
        })
        .loose()
        .optional(),
    })
    .loose()
    .optional(),
})

export const qlooTagsSchema = z.object({
  success: z.boolean().optional(),
  results: z
    .object({ tags: z.array(qlooTag).optional().default([]) })
    .loose(),
})

export const qlooSearchSchema = z.object({
  results: z
    .union([
      z.array(qlooEntity),
      z.object({ entities: z.array(qlooEntity).optional().default([]) }).loose(),
    ])
    .optional(),
})

export type QlooInsightsResponse = z.infer<typeof qlooInsightsSchema>
export type QlooTagsResponse = z.infer<typeof qlooTagsSchema>
export type QlooSearchResponse = z.infer<typeof qlooSearchSchema>
