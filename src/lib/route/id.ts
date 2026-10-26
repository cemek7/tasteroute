/**
 * A route's identity is its locality and the places in it, in order. Saving
 * keys on this id, so a route that swapped a stop must not keep the old one:
 * it would overwrite the original rather than sit beside it.
 */
export function routeId(localityName: string, candidateIds: string[]): string {
  return `${localityName.toLowerCase().replace(/\s+/g, '-')}-${candidateIds.join('_')}`
}
