const ALLOWED_INSIGHTS_PARAMS = new Set([
  'filter.type',
  'filter.location.query',
  'filter.location.radius',
  'filter.tags',
  'signal.location',
  'signal.location.query',
  'signal.location.radius',
  'signal.interests.tags',
  'signal.interests.entities',
  'operator.signal.interests.tags',
  'feature.explainability',
  'take',
  'page',
  'offset',
])

export function buildInsightsParams(
  input: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_INSIGHTS_PARAMS.has(key)) {
      throw new Error(
        `"${key}" is not an allowed Qloo insights parameter. Qloo silently ignores unknown parameters, so this would have returned 200 with a query that did something else.`,
      )
    }
    if (value === undefined) continue
    params.set(key, String(value))
  }
  return params
}
