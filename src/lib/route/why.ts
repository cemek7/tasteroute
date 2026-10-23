import type { Candidate, Evidence, ProviderExplainability } from '../providers/types'

export type WhyContext = {
  requestedTagIds: string[]
  locality: string
  explainability: ProviderExplainability | null
  /** entityId -> display name, for the places the user said they liked */
  seedNames: Record<string, string>
}

const TOP_N_RANK: Record<3 | 5 | 10 | 'all', number> = {
  3: 3,
  5: 5,
  10: 10,
  all: Number.POSITIVE_INFINITY,
}

export function buildWhy(
  c: Candidate,
  ctx: WhyContext,
): { why: string; evidence: Evidence[] } {
  const evidence: Evidence[] = []

  // 1. Qloo's own explainability, strongest when available.
  for (const signal of ctx.explainability?.signalEntities ?? []) {
    if (c.providerRank > TOP_N_RANK[signal.topN]) continue
    const name = ctx.seedNames[signal.entityId]
    if (!name) continue
    evidence.push({
      kind: 'explainability',
      label: `Qloo links this to ${name}`,
      value: signal.avgScore,
      source: 'qloo',
    })
  }

  // 2. The candidate's own tags, intersected with what was asked for.
  const requested = new Set(ctx.requestedTagIds)
  const matched = c.tags.filter((t) => requested.has(t.id))
  if (matched.length > 0) {
    evidence.push({
      kind: 'tag',
      label: `Tagged ${matched.map((t) => t.name).join(' and ')}`,
      source: 'qloo',
    })
  }

  // 3. The affinity score.
  if (c.affinity != null) {
    evidence.push({
      kind: 'affinity',
      label: `${(c.affinity * 100).toFixed(0)}% taste match`,
      value: c.affinity,
      source: 'qloo',
    })
  }

  // 4. Descriptive fields Qloo returns on the place.
  const descriptor = c.descriptors.goodFor ?? c.descriptors.ambience ?? c.descriptors.cuisine
  if (descriptor) {
    evidence.push({ kind: 'descriptor', label: `Good for ${descriptor}`, source: 'qloo' })
  }

  // 5. Popularity, weakest, mentioned only when nothing better exists.
  if (evidence.length === 0 && c.popularity != null) {
    evidence.push({
      kind: 'popularity',
      label: `Among the better known places in ${ctx.locality}`,
      value: c.popularity,
      source: 'qloo',
    })
  }

  if (evidence.length === 0) {
    const what = c.category ? c.category.replace(/_/g, ' ') : 'place'
    const article = /^[aeiou]/i.test(what) ? 'An' : 'A'
    return { why: `${article} ${what} in ${ctx.locality}.`, evidence }
  }

  return { why: `${evidence.map((e) => e.label).join('. ')}.`, evidence }
}
