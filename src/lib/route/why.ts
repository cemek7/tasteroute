import type { Candidate, Evidence, ProviderExplainability } from '../providers/types'

export type WhyContext = {
  requestedTagIds: string[]
  locality: string
  explainability: ProviderExplainability | null
  /** entityId -> display name, for the places the user said they liked */
  seedNames: Record<string, string>
}

const MAX_QUOTE = 72
/** Beyond this a value is prose from a *_description field, not a label. */
const LABEL_MAX = 40

/**
 * good_for tags that describe almost any venue. Qloo attaches "Good For Kids"
 * to half of Lagos, and three stops all reading "Good for kids" looks broken,
 * so these yield to anything more specific.
 */
const GENERIC_GOOD_FOR = new Set([
  'kids',
  'groups',
  'large group',
  'small group',
  'families',
  'solo',
  'casual',
  'business',
])

/**
 * good_for values are Title Case tag names. Many already read "Good For
 * Kids", so the prefix has to be stripped before we add our own, or the line
 * comes out as "Good for good for kids".
 */
function goodForPhrase(raw: string): string {
  const parts = raw
    .split(', ')
    .map((part) => part.toLowerCase().replace(/^good for\s+/, '').trim())
    .filter(Boolean)
  return [...new Set(parts)].join(', ')
}

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=\.)\s/)[0] ?? text
  const trimmed = sentence.replace(/\.$/, '').trim()
  return trimmed.length > MAX_QUOTE ? `${trimmed.slice(0, MAX_QUOTE).trimEnd()}…` : trimmed
}

/**
 * Qloo mixes two shapes in these fields. good_for is a tag list; the
 * *_description fields are whole paragraphs of marketing prose. A paragraph
 * gets quoted as Qloo's words, never folded into a sentence of ours.
 */
function describe(c: Candidate): string | null {
  const { goodFor, cuisine, ambience } = c.descriptors

  const phrase = goodFor ? goodForPhrase(goodFor) : ''
  const distinctive =
    phrase.length > 0 && phrase.split(', ').some((p) => !GENERIC_GOOD_FOR.has(p))

  if (distinctive) return `Good for ${phrase}`
  if (cuisine && cuisine.length <= LABEL_MAX) return `Serves ${cuisine}`
  if (ambience) return `Qloo calls it "${firstSentence(ambience)}"`
  if (cuisine) return `Qloo calls it "${firstSentence(cuisine)}"`
  // Nothing better: a generic tag beats saying nothing at all.
  if (phrase) return `Good for ${phrase}`
  return null
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

  // 4. Descriptive fields Qloo returns on the place. These come in two very
  // different shapes: good_for and cuisine are short labels, while the
  // *_description fields are whole paragraphs of prose. Prefixing a paragraph
  // with "Good for" produced lines like "Good for The atmosphere is
  // characterized by...", so each shape gets its own rendering.
  const descriptorLabel = describe(c)
  if (descriptorLabel) {
    evidence.push({ kind: 'descriptor', label: descriptorLabel, source: 'qloo' })
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
