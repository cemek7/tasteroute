import { z } from 'zod'

const geocode = z
  .object({
    latitude: z.number().nullish(),
    longitude: z.number().nullish(),
  })
  .loose()

const qlooTag = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  popularity: z.number().nullish(),
})

const qlooEntity = z.object({
  entity_id: z.string(),
  name: z.string(),
  type: z.string().nullish(),
  subtype: z.string().nullish(),
  popularity: z.number().nullish(),
  location: z
    .object({ lat: z.number().nullish(), lon: z.number().nullish() })
    .loose()
    .nullish(),
  tags: z
    .array(qlooTag)
    .nullish()
    .transform((t) => t ?? []),
  // Qloo sends explicit null for an absent property rather than omitting the
  // key, so every field here is nullish, not merely optional.
  properties: z
    .object({
      address: z.string().nullish(),
      geocode: geocode.nullish(),
      hours: z.unknown().nullish(),
      business_rating: z.number().nullish(),
      is_closed: z.boolean().nullish(),
      // Qloo returns good_for as an array of ambience/event tags, not a string.
      good_for: z
        .array(z.object({ name: z.string() }).loose())
        .nullish(),
      keywords: z.unknown().nullish(),
      ambience_description: z.string().nullish(),
      cuisine_description: z.string().nullish(),
      cost_description: z.string().nullish(),
      // Qloo sends live_music as a boolean, not a description.
      live_music: z.boolean().nullish(),
      primary_genre: z.object({ id: z.string() }).loose().nullish(),
      image: z.object({ url: z.string() }).loose().nullish(),
      images: z.array(z.object({ url: z.string() }).loose()).nullish(),
      neighborhood: z.string().nullish(),
      neighborhood_description: z.string().nullish(),
      overall_description: z.string().nullish(),
      unique_selling_points: z.string().nullish(),
      phone: z.string().nullish(),
      website: z.string().nullish(),
    })
    .loose()
    .nullish()
    .transform((p) => p ?? {}),
  query: z
    .object({
      affinity: z.number().nullish(),
      distance: z.number().nullish(),
    })
    .loose()
    .nullish(),
})

const explainabilityEffect = z.array(
  z.object({ entity_id: z.string(), avg_score: z.number() }),
)

export const qlooInsightsSchema = z.object({
  success: z.boolean().optional(),
  warnings: z.array(z.object({ type: z.string() }).loose()).optional(),
  results: z
    .object({
      entities: z
        .array(qlooEntity)
        .nullish()
        .transform((e) => e ?? []),
    })
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
    .object({
      tags: z
        .array(qlooTag)
        .nullish()
        .transform((t) => t ?? []),
    })
    .loose(),
})

export const qlooSearchSchema = z.object({
  results: z
    .union([
      z.array(qlooEntity),
      z
        .object({
          entities: z
            .array(qlooEntity)
            .nullish()
            .transform((e) => e ?? []),
        })
        .loose(),
    ])
    .optional(),
})

export type QlooInsightsResponse = z.infer<typeof qlooInsightsSchema>
export type QlooTagsResponse = z.infer<typeof qlooTagsSchema>
export type QlooSearchResponse = z.infer<typeof qlooSearchSchema>
