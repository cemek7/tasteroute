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

/**
 * `/v2/tags` and `/search` need the same protection as `/v2/insights`: Qloo
 * ignores an unknown parameter and still returns 200, so a typo produces a
 * quietly different search rather than an error.
 */
const ALLOWED_TAGS_PARAMS = new Set([
  'filter.query',
  'filter.tag.types',
  'filter.parents.types',
  'filter.popularity.min',
  'filter.popularity.max',
  'take',
  'page',
  'offset',
])

const ALLOWED_SEARCH_PARAMS = new Set([
  'query',
  'types',
  'filter.radius',
  'operator.filter.tags',
  'take',
  'page',
  'offset',
])

function buildGuarded(
  input: Record<string, string | number | boolean | undefined>,
  allowed: Set<string>,
  endpointLabel: string,
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) {
      throw new Error(
        `"${key}" is not an allowed Qloo ${endpointLabel} parameter. Qloo silently ignores unknown parameters, so this would have returned 200 with a query that did something else.`,
      )
    }
    if (value === undefined) continue
    params.set(key, String(value))
  }
  return params
}

export function buildTagsParams(
  input: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  return buildGuarded(input, ALLOWED_TAGS_PARAMS, 'tags')
}

export function buildSearchParams(
  input: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  return buildGuarded(input, ALLOWED_SEARCH_PARAMS, 'search')
}
