import type { TasteProvider } from '../providers/types'

const MAX_TAGS_PER_TERM = 3

/**
 * Turns the things a person wants to avoid into Qloo tag URNs.
 *
 * This step was missing, and the consequence was a lie: `avoid` was passing
 * raw words straight into `filter.exclude.tags`, which is a measured no-op —
 * Qloo ignores a bare word there — while the app reported "Avoiding — hookah"
 * as applied. A term we cannot resolve is now reported as unresolved rather
 * than silently doing nothing.
 */
export async function resolveAvoidTags(
  provider: TasteProvider,
  avoid: string[] | undefined,
): Promise<{ tagIds: string[]; unresolved: string[] }> {
  if (!avoid?.length) return { tagIds: [], unresolved: [] }

  const tagIds: string[] = []
  const unresolved: string[] = []

  for (const term of avoid) {
    const tags = await provider.findTags(term)
    if (tags.length === 0) {
      unresolved.push(term)
      continue
    }
    for (const t of tags.slice(0, MAX_TAGS_PER_TERM)) {
      if (!tagIds.includes(t.id)) tagIds.push(t.id)
    }
  }

  return { tagIds, unresolved }
}
