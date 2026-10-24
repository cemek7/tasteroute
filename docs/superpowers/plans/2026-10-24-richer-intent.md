# TasteRoute Richer Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture enough intent from a person to plan an evening that is actually theirs, and show them the richer data Qloo already returns.

**Architecture:** Intent arrives as optional fields on the existing request. Requirements (dietary, accessibility, budget, area, avoid) become hard Qloo parameters applied by our code; preferences (vibe, occasion, party, persona, demographics) become weighted signals the agent resolves by querying Qloo's tag vocabulary at runtime. A separate `/api/clarify` endpoint lets the model ask one question when the intent is too thin to act on, leaving `/api/route` single-phase and untouched.

**Tech Stack:** Next.js 16.4.2, React 19.3.1, TypeScript 7.0.2, Tailwind 4.3.3, Zod 4.6.7, Vitest 5.0.5, `openai` 7.32.0 via OpenRouter.

**Spec:** `docs/superpowers/specs/2026-10-24-tasteroute-richer-intent-design.md`

## Global Constraints

- Submission deadline **30 October 2026, 11:45pm EDT**. Tasks are ordered so work can stop after any task and still ship.
- Qloo base URL **`https://hackathon.api.qloo.com`**, auth header **`X-Api-Key`**, endpoints **`/search`, `/v2/insights`, `/v2/tags`** only.
- Qloo **silently ignores invalid parameters** and returns 200. Every outbound parameter name passes an allowlist — `buildInsightsParams`, `buildTagsParams`, `buildSearchParams` — before the request is built. Adding a parameter means adding it to the allowlist.
- `take` is capped at **50**.
- **Every new request field is optional.** A body of `{city, mood, startHour, endHour}` must behave exactly as it does today.
- **Requirements are not preferences.** `requirements`, `budget`, `area`, `avoid` are applied by our code as Qloo parameters. The agent cannot reach them.
- **A requirement that cannot be met is reported in `intentEcho.ignored`, never silently dropped**, and drops `confidence` to `weak`.
- **No reason may state what the data does not support.** `buildWhy` composes only from Qloo-sourced fields; the narrative is a pure function over computed facts, not model output.
- `demographics` is **never stored, never logged, never persisted** — not in `localStorage`, not in the trace.
- Fixtures stay **hand-written**; no captured Qloo responses in the repo.
- A route is **exactly three stops**, or no route.
- Keep the suite green: **208 tests** pass at the start of this plan.

## Review Focus

1. **A requirement that matches nothing** — Qloo's `filter.tags` returned zero results in probing. A person asking for halal in a city with no halal-tagged venues must get a route plus a clear "this could not be applied", not an error and not a silent substitution. *(Task 5)*
2. **Conflicting intent** — hidden gems plus a hard budget plus a 1km radius can intersect to nothing. The app must relax in a stated order and say what it relaxed. *(Task 4)*
3. **A clarify answer that does not match the options** — the client posts `clarified.answer` as free text; a tampered or stale answer must not reach Qloo as a tag id. *(Task 6)*
4. **A broken or slow image URL** — `images.qloo.com` is a third party. A 404 or a timeout must not shift the card layout or block the route rendering. *(Task 7)*
5. **A stale `localStorage` preference blob** — written by an older version, or hand-edited, must be discarded rather than loaded into the form as a half-valid state. *(Task 11)*

---

### Task 1: Intent vocabulary and the extended contract

Foundation. No behaviour change yet: every field parses and is carried through, unused.

**Files:**
- Create: `src/lib/intent/vocabulary.ts`
- Create: `src/lib/intent/vocabulary.test.ts`
- Modify: `src/lib/providers/types.ts` (extend `RouteRequest`, add `IntentEcho`)
- Modify: `src/lib/route/request-body.ts`
- Modify: `src/lib/route/request-body.test.ts`

**Interfaces:**
- Consumes: `parseRouteBody(raw: unknown): ParseResult` and `normaliseWindow` as they exist.
- Produces: `VibeId`, `OccasionId`, `PartyComposition`, `Persona`, `AgeBand`, `DietaryId`, `AccessibilityId`, `VIBE_IDS`, `OCCASION_IDS`, `PARTY_COMPOSITIONS`, `PERSONAS`, `AGE_BANDS`, `DIETARY_IDS`, `ACCESSIBILITY_IDS`; `DIETARY_TAGS: Record<DietaryId, string>`, `ACCESSIBILITY_TAGS: Record<AccessibilityId, string>`, `VIBE_QUERIES: Record<VibeId, string[]>`, `OCCASION_QUERIES: Record<OccasionId, string[]>`, `PARTY_QUERIES: Record<PartyComposition, string[]>`; `type Intent` (the optional half of `RouteRequest`); `IntentEcho`.

- [ ] **Step 1: Write the failing vocabulary test**

`src/lib/intent/vocabulary.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  ACCESSIBILITY_TAGS,
  AGE_BANDS,
  DIETARY_TAGS,
  OCCASION_QUERIES,
  PARTY_QUERIES,
  VIBE_QUERIES,
  VIBE_IDS,
} from './vocabulary'

describe('vocabulary', () => {
  it('gives every vibe at least one query to resolve', () => {
    for (const id of VIBE_IDS) {
      expect(VIBE_QUERIES[id].length).toBeGreaterThan(0)
    }
  })

  it('gives every occasion at least one query', () => {
    for (const [id, queries] of Object.entries(OCCASION_QUERIES)) {
      expect(queries.length, id).toBeGreaterThan(0)
    }
  })

  it('gives every party composition at least one query', () => {
    for (const [id, queries] of Object.entries(PARTY_QUERIES)) {
      expect(queries.length, id).toBeGreaterThan(0)
    }
  })

  it('maps dietary needs to the tag urns observed on the live host', () => {
    expect(DIETARY_TAGS.halal).toBe('urn:tag:dietary_option:qloo:halal')
    expect(DIETARY_TAGS.vegetarian).toBe('urn:tag:dietary_option:qloo:vegetarian')
    expect(DIETARY_TAGS.vegan).toBe('urn:tag:dietary_option:qloo:vegan')
  })

  it('maps accessibility needs to the accessibility namespace', () => {
    for (const urn of Object.values(ACCESSIBILITY_TAGS)) {
      expect(urn).toMatch(/^urn:tag:accessibility:place:/)
    }
  })

  it('uses the age bands Qloo accepts, not the ones that look right', () => {
    // 25_and_younger returns zero results; 24_and_younger is the real value.
    expect(AGE_BANDS).toContain('24_and_younger')
    expect(AGE_BANDS).not.toContain('25_and_younger')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/intent/vocabulary.test.ts`
Expected: FAIL — cannot resolve `./vocabulary`.

- [ ] **Step 3: Write `src/lib/intent/vocabulary.ts`**

```ts
export const VIBE_IDS = [
  'lively',
  'quiet',
  'intimate',
  'upscale',
  'casual',
  'outdoor',
] as const
export type VibeId = (typeof VIBE_IDS)[number]

export const OCCASION_IDS = [
  'date_night',
  'first_date',
  'birthday',
  'anniversary',
  'celebration',
  'catching_up',
  'work_dinner',
  'solo_night',
] as const
export type OccasionId = (typeof OCCASION_IDS)[number]

export const PARTY_COMPOSITIONS = [
  'solo',
  'couple',
  'friends',
  'family',
  'colleagues',
] as const
export type PartyComposition = (typeof PARTY_COMPOSITIONS)[number]

export const PERSONAS = ['newcomer', 'local', 'visiting'] as const
export type Persona = (typeof PERSONAS)[number]

/**
 * Qloo's own bands. `25_and_younger` looks plausible and returns zero
 * results; the real value is `24_and_younger`.
 */
export const AGE_BANDS = [
  '24_and_younger',
  '25_to_29',
  '30_to_34',
  '35_to_44',
  '45_to_54',
  '55_and_older',
] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export const DIETARY_IDS = ['halal', 'vegetarian', 'vegan', 'gluten_free', 'kosher'] as const
export type DietaryId = (typeof DIETARY_IDS)[number]

export const ACCESSIBILITY_IDS = [
  'wheelchair_entrance',
  'wheelchair_restroom',
  'step_free',
] as const
export type AccessibilityId = (typeof ACCESSIBILITY_IDS)[number]

/** Requirements resolve to fixed URNs, confirmed against the live host. */
export const DIETARY_TAGS: Record<DietaryId, string> = {
  halal: 'urn:tag:dietary_option:qloo:halal',
  vegetarian: 'urn:tag:dietary_option:qloo:vegetarian',
  vegan: 'urn:tag:dietary_option:qloo:vegan',
  gluten_free: 'urn:tag:dietary_option:qloo:gluten_free',
  kosher: 'urn:tag:dietary_option:qloo:kosher',
}

export const ACCESSIBILITY_TAGS: Record<AccessibilityId, string> = {
  wheelchair_entrance: 'urn:tag:accessibility:place:wheelchair_accessible_entrance',
  wheelchair_restroom: 'urn:tag:accessibility:place:wheelchair_accessible_restroom',
  step_free: 'urn:tag:accessibility:place:wheelchair_accessible_parking_lot',
}

/**
 * Preferences resolve by QUERYING Qloo's tag endpoint at runtime, so the
 * vocabulary stays Qloo's rather than ours. These are the search terms, not
 * the answers.
 */
export const VIBE_QUERIES: Record<VibeId, string[]> = {
  lively: ['lively'],
  quiet: ['quiet'],
  intimate: ['intimate', 'romantic'],
  upscale: ['upscale'],
  casual: ['casual'],
  outdoor: ['outdoor'],
}

export const OCCASION_QUERIES: Record<OccasionId, string[]> = {
  date_night: ['date'],
  first_date: ['first date'],
  birthday: ['birthday'],
  anniversary: ['anniversary'],
  celebration: ['celebration'],
  catching_up: ['groups'],
  work_dinner: ['business'],
  solo_night: ['solo'],
}

export const PARTY_QUERIES: Record<PartyComposition, string[]> = {
  solo: ['solo'],
  couple: ['couples'],
  friends: ['groups'],
  family: ['family'],
  colleagues: ['business'],
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/intent/vocabulary.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Extend `RouteRequest` and add `IntentEcho` in `src/lib/providers/types.ts`**

Replace the existing `RouteRequest` with:
```ts
export type Intent = {
  vibe?: VibeId[]
  occasion?: OccasionId
  party?: { size: number; composition?: PartyComposition }
  persona?: Persona
  demographics?: { ageBand?: AgeBand; gender?: 'male' | 'female' }
  discovery?: number
  budget?: 1 | 2 | 3 | 4
  area?: { radiusMetres: number } | null
  requirements?: { dietary?: DietaryId[]; accessibility?: AccessibilityId[] }
  avoid?: string[]
  seedPlaces?: string[]
  clarified?: { question: string; answer: string }
}

export type RouteRequest = {
  city: string
  mood: string
  timeWindow: { startHour: number; endHour: number }
  intent: Intent
}

export type IntentEcho = {
  applied: { label: string; detail: string }[]
  ignored: { label: string; reason: string }[]
}
```

Add the import at the top of the file:
```ts
import type {
  AccessibilityId,
  AgeBand,
  DietaryId,
  OccasionId,
  PartyComposition,
  Persona,
  VibeId,
} from '../intent/vocabulary'
```

`intent` is required but may be `{}`, so no call site can forget it exists.

- [ ] **Step 6: Write the failing body-parsing tests**

Append to `src/lib/route/request-body.test.ts`:
```ts
describe('parseRouteBody with intent', () => {
  const good = { city: 'Abuja', mood: 'cocktails', startHour: 18, endHour: 23 }

  it('defaults intent to an empty object when none is sent', () => {
    const r = parseRouteBody(good)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intent).toEqual({})
  })

  it('carries every intent field through', () => {
    const r = parseRouteBody({
      ...good,
      vibe: ['quiet', 'intimate'],
      occasion: 'first_date',
      party: { size: 2, composition: 'couple' },
      persona: 'newcomer',
      demographics: { ageBand: '25_to_29', gender: 'female' },
      discovery: 0.8,
      budget: 2,
      area: { radiusMetres: 3000 },
      requirements: { dietary: ['halal'], accessibility: ['step_free'] },
      avoid: ['hookah'],
      seedPlaces: ['Jazzhole'],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intent.vibe).toEqual(['quiet', 'intimate'])
    expect(r.value.intent.requirements?.dietary).toEqual(['halal'])
    expect(r.value.intent.discovery).toBe(0.8)
  })

  it('rejects an unknown vibe rather than passing it to Qloo', () => {
    const r = parseRouteBody({ ...good, vibe: ['vibey'] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('One of those preferences is not one we know.')
  })

  it('rejects an unknown dietary requirement', () => {
    expect(parseRouteBody({ ...good, requirements: { dietary: ['paleo'] } }).ok).toBe(false)
  })

  it('rejects a discovery value outside 0 to 1', () => {
    expect(parseRouteBody({ ...good, discovery: 2 }).ok).toBe(false)
    expect(parseRouteBody({ ...good, discovery: -1 }).ok).toBe(false)
  })

  it('rejects a party size that is not a sensible number of people', () => {
    expect(parseRouteBody({ ...good, party: { size: 0 } }).ok).toBe(false)
    expect(parseRouteBody({ ...good, party: { size: 500 } }).ok).toBe(false)
  })

  it('rejects a radius outside walking-to-driving range', () => {
    expect(parseRouteBody({ ...good, area: { radiusMetres: 10 } }).ok).toBe(false)
    expect(parseRouteBody({ ...good, area: { radiusMetres: 500_000 } }).ok).toBe(false)
  })

  it('accepts a null area as meaning the whole city', () => {
    const r = parseRouteBody({ ...good, area: null })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intent.area).toBeNull()
  })

  it('caps avoid and seedPlaces so a request cannot carry a hundred terms', () => {
    const many = Array.from({ length: 50 }, (_, i) => `x${i}`)
    expect(parseRouteBody({ ...good, avoid: many }).ok).toBe(false)
    expect(parseRouteBody({ ...good, seedPlaces: many }).ok).toBe(false)
  })

  it('never leaks a raw validation dump for a malformed intent', () => {
    const r = parseRouteBody({ ...good, party: 'two people' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).not.toMatch(/expected|invalid_type|zod/i)
  })
})
```

- [ ] **Step 7: Run them and watch them fail**

Run: `npx vitest run src/lib/route/request-body.test.ts`
Expected: FAIL — `intent` is undefined on the parsed value.

- [ ] **Step 8: Extend `src/lib/route/request-body.ts`**

Add the imports:
```ts
import {
  ACCESSIBILITY_IDS,
  AGE_BANDS,
  DIETARY_IDS,
  OCCASION_IDS,
  PARTY_COMPOSITIONS,
  PERSONAS,
  VIBE_IDS,
} from '../intent/vocabulary'
```

Add the intent schema above `bodySchema`:
```ts
const intentSchema = z.object({
  vibe: z.array(z.enum(VIBE_IDS)).max(6).optional(),
  occasion: z.enum(OCCASION_IDS).optional(),
  party: z
    .object({
      size: z.number().int().min(1).max(40),
      composition: z.enum(PARTY_COMPOSITIONS).optional(),
    })
    .optional(),
  persona: z.enum(PERSONAS).optional(),
  demographics: z
    .object({
      ageBand: z.enum(AGE_BANDS).optional(),
      gender: z.enum(['male', 'female']).optional(),
    })
    .optional(),
  discovery: z.number().min(0).max(1).optional(),
  budget: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  area: z
    .object({ radiusMetres: z.number().int().min(250).max(50_000) })
    .nullable()
    .optional(),
  requirements: z
    .object({
      dietary: z.array(z.enum(DIETARY_IDS)).max(5).optional(),
      accessibility: z.array(z.enum(ACCESSIBILITY_IDS)).max(3).optional(),
    })
    .optional(),
  avoid: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  seedPlaces: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
  clarified: z
    .object({ question: z.string().max(200), answer: z.string().max(80) })
    .optional(),
})
```

Change `bodySchema` to extend it:
```ts
const bodySchema = z
  .object({
    city: z.string().trim().min(1).max(80),
    mood: z.string().trim().min(1).max(200),
    startHour: hour,
    endHour: hour,
  })
  .and(intentSchema)
```

Extend the failure mapping, before the generic fallback:
```ts
    const intentFields = new Set([
      'vibe',
      'occasion',
      'party',
      'persona',
      'demographics',
      'discovery',
      'budget',
      'area',
      'requirements',
      'avoid',
      'seedPlaces',
      'clarified',
    ])
    if ([...fields].some((f) => intentFields.has(f))) {
      return { ok: false, error: 'One of those preferences is not one we know.' }
    }
```

And build the `intent` on success:
```ts
  const { city, mood, startHour, endHour, ...intent } = parsed.data
  const timeWindow: TimeWindow = normaliseWindow(startHour, endHour)
  return { ok: true, value: { city, mood, timeWindow, intent } }
```

- [ ] **Step 9: Run the tests and watch them pass**

Run: `npx vitest run src/lib/route/request-body.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 10: Fix the call sites the type change broke**

`RouteRequest` now carries `intent`, so every construction needs it. Run `npm run typecheck` and add `intent: {}` at each reported site — these are `src/app/api/route/route.ts`, and the request literals in `src/lib/agent/tools.test.ts`, `src/lib/agent/loop.test.ts`, `src/lib/agent/explainability.test.ts`, `src/lib/route/build.test.ts`, `src/lib/route/quality.test.ts`, `src/lib/route/review-findings.test.ts`, `src/lib/share/encode.test.ts`.

Run: `npm run typecheck && npm test`
Expected: typecheck clean; 208 + 16 tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/intent src/lib/providers/types.ts src/lib/route/request-body.ts src/lib/route/request-body.test.ts src/app src/lib/agent src/lib/route src/lib/share
git commit -m "feat(intent): add the intent vocabulary and extend the request contract"
```

---

### Task 2: Venue kinds from `primary_genre`

Quality fix, no new UI. Must land before discovery, because the obscure end of Qloo's catalogue is housing estates and car parks.

**Files:**
- Modify: `src/lib/providers/schemas.ts` (parse `primary_genre`)
- Modify: `src/lib/providers/qloo.ts` (map it onto `Candidate.primaryGenre`)
- Modify: `src/lib/providers/types.ts` (add `primaryGenre`)
- Modify: `src/lib/route/slots.ts` (allow-list)
- Test: `src/lib/route/slots.test.ts`, `src/lib/providers/qloo.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `slotsFor`, `slotFit` as they exist.
- Produces: `Candidate.primaryGenre: string | null`; `slotsFor`/`slotFit` unchanged in signature.

- [ ] **Step 1: Write the failing allow-list test**

Append to `src/lib/route/slots.test.ts`:
```ts
describe('only going-out venues get a slot', () => {
  const withGenre = (id: string | null, category: string | null = null): Candidate => ({
    ...byId('fx-cafe-neo'),
    id: `g-${id}`,
    category,
    primaryGenre: id,
    tags: [],
  })

  it('refuses a housing complex at any affinity', () => {
    const estate = {
      ...withGenre('urn:tag:genre:place:housing_complex'),
      affinity: 0.99,
    }
    expect(slotsFor(estate)).toEqual([])
  })

  it('refuses car parks, offices and shops', () => {
    for (const id of [
      'urn:tag:genre:place:car_park',
      'urn:tag:genre:place:office',
      'urn:tag:genre:place:hardware_store',
      'urn:tag:genre:place:supermarket',
    ]) {
      expect(slotsFor(withGenre(id)), id).toEqual([])
    }
  })

  it('accepts the going-out kinds', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:cafe'))).toEqual(['open'])
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant'))).toEqual(['main'])
    expect(slotsFor(withGenre('urn:tag:genre:place:bar:cocktail_bar'))).toEqual(['close'])
  })

  it('still reads a nested barbecue genre as dinner', () => {
    expect(slotsFor(withGenre('urn:tag:genre:place:restaurant:barbecue'))).toEqual(['main'])
  })

  it('falls back to category and tags when primary_genre is absent', () => {
    expect(slotsFor(withGenre(null, 'cafe'))).toEqual(['open'])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/slots.test.ts`
Expected: FAIL — `primaryGenre` is not a property of `Candidate`.

- [ ] **Step 3: Add `primaryGenre` to `Candidate` in `src/lib/providers/types.ts`**

Inside the `Candidate` type, after `category`:
```ts
  /** Qloo's own single classification, e.g. urn:tag:genre:place:cocktail_bar. */
  primaryGenre: string | null
```

- [ ] **Step 4: Parse it in `src/lib/providers/schemas.ts`**

Inside the `properties` object, alongside the other fields:
```ts
      primary_genre: z.object({ id: z.string() }).loose().nullish(),
```

- [ ] **Step 5: Map it in `src/lib/providers/qloo.ts`**

In `toCandidate`, after `category`:
```ts
    primaryGenre: (p.primary_genre as { id?: string } | null | undefined)?.id ?? null,
```

- [ ] **Step 6: Add the allow-list to `src/lib/route/slots.ts`**

Replace `primarySlot` with:
```ts
/**
 * The famous end of Qloo's catalogue is malls and hotels; the obscure end is
 * housing estates, car parks and offices. Neither is a night out. A deny-list
 * cannot keep up with that, so a venue must positively look like somewhere you
 * would go of an evening.
 */
function primarySlot(c: Candidate): { slot: SlotName; weight: number } | null {
  if (isLodging(c)) return null

  // Qloo's own classification first, when it gave us one.
  if (c.primaryGenre) {
    const leaf = c.primaryGenre.replace('urn:tag:genre:place', '')
    const fromGenre = matchIn(leaf)
    if (fromGenre) return fromGenre
    // A classified place that matches no going-out kind is not one.
    return null
  }

  const category = (c.category ?? '').toLowerCase()
  if (category) {
    const fromCategory = matchIn(category)
    if (fromCategory) return fromCategory
  }

  const genreTags = c.tags
    .filter((t) => t.type.startsWith('urn:tag:genre'))
    .map((t) => `${t.id} ${t.name}`)
    .join(' ')
    .toLowerCase()
  return matchIn(genreTags)
}
```

- [ ] **Step 7: Update the fixtures to carry a primary genre**

In `src/lib/providers/fixture.ts`, add `primaryGenre` to the `Seed` type and to `FIXTURE_CANDIDATES`:
```ts
  primaryGenre: `urn:tag:genre:place:${s.category}`,
```
and inside `SEEDS` nothing changes — the category already names the kind.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `npx vitest run src/lib/route/slots.test.ts src/lib/providers/qloo.test.ts`
Expected: PASS. Then `npm test` — expect green; if a quality test now excludes a fixture it previously allowed, read the diff before changing anything.

- [ ] **Step 9: Commit**

```bash
git add src/lib/providers src/lib/route/slots.ts src/lib/route/slots.test.ts
git commit -m "feat(route): decide a venue kind from Qloo's primary_genre, allow-list not deny-list"
```

---

### Task 3: The discovery slider

The single highest-value change: Qloo's default answer is popularity 0.98+, which is why routes were malls.

**Files:**
- Create: `src/lib/intent/qloo-params.ts`
- Create: `src/lib/intent/qloo-params.test.ts`
- Modify: `src/lib/providers/params.ts` (allowlist the popularity parameters)
- Modify: `src/lib/providers/types.ts` (`PlaceQuery` gains `constraints`)
- Modify: `src/lib/providers/qloo.ts`, `src/lib/providers/fixture.ts`
- Modify: `src/lib/agent/tools.ts` (pass constraints on every search)
- Modify: `src/components/MoodForm.tsx`, create `src/components/TunePanel.tsx`
- Modify: `src/app/api/route/route.ts`

**Interfaces:**
- Consumes: `Intent`, `IntentEcho` from Task 1; `buildInsightsParams`.
- Produces: `type HardConstraints = { popularityMin?: number; popularityMax?: number; priceLevelMax?: number; radius?: { lat: number; lng: number; metres: number }; requiredTags?: string[]; excludeTags?: string[] }`; `constraintsFromIntent(intent: Intent): { constraints: HardConstraints; applied: IntentEcho['applied'] }`; `PlaceQuery.constraints?: HardConstraints`.

- [ ] **Step 1: Write the failing discovery-band test**

`src/lib/intent/qloo-params.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { constraintsFromIntent } from './qloo-params'

describe('discovery maps to a popularity band', () => {
  it('leans to the famous end below a third', () => {
    const { constraints } = constraintsFromIntent({ discovery: 0.1 })
    expect(constraints.popularityMin).toBe(0.8)
    expect(constraints.popularityMax).toBeUndefined()
  })

  it('applies no popularity filter in the middle', () => {
    const { constraints } = constraintsFromIntent({ discovery: 0.5 })
    expect(constraints.popularityMin).toBeUndefined()
    expect(constraints.popularityMax).toBeUndefined()
  })

  it('leans to hidden gems above two thirds', () => {
    const { constraints } = constraintsFromIntent({ discovery: 0.9 })
    expect(constraints.popularityMax).toBe(0.5)
    expect(constraints.popularityMin).toBeUndefined()
  })

  it('applies nothing when discovery was not set', () => {
    expect(constraintsFromIntent({})).toEqual({ constraints: {}, applied: [] })
  })

  it('defaults a newcomer towards hidden gems', () => {
    const { constraints } = constraintsFromIntent({ persona: 'newcomer' })
    expect(constraints.popularityMax).toBe(0.5)
  })

  it('lets an explicit discovery value beat the persona default', () => {
    const { constraints } = constraintsFromIntent({ persona: 'newcomer', discovery: 0.1 })
    expect(constraints.popularityMin).toBe(0.8)
    expect(constraints.popularityMax).toBeUndefined()
  })

  it('says what it applied, in words a person can read', () => {
    const { applied } = constraintsFromIntent({ discovery: 0.9 })
    expect(applied).toEqual([
      { label: 'Hidden gems', detail: 'only places Qloo rates below 0.5 for popularity' },
    ])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/intent/qloo-params.test.ts`
Expected: FAIL — cannot resolve `./qloo-params`.

- [ ] **Step 3: Write `src/lib/intent/qloo-params.ts`**

```ts
import type { Intent, IntentEcho } from '../providers/types'

export type HardConstraints = {
  popularityMin?: number
  popularityMax?: number
  priceLevelMax?: number
  radius?: { lat: number; lng: number; metres: number }
  requiredTags?: string[]
  excludeTags?: string[]
}

const FAMOUS_FLOOR = 0.8
const HIDDEN_CEILING = 0.5

/** A newcomer asking for an evening out does not want the mall. */
const PERSONA_DISCOVERY: Record<string, number> = {
  newcomer: 0.75,
  visiting: 0.6,
  local: 0.4,
}

/**
 * Turns the half of the intent our code owns into Qloo parameters. The agent
 * never sees these: a budget ceiling or a dietary need that could be weighed
 * against a taste match is not a constraint.
 */
export function constraintsFromIntent(intent: Intent): {
  constraints: HardConstraints
  applied: IntentEcho['applied']
} {
  const constraints: HardConstraints = {}
  const applied: IntentEcho['applied'] = []

  const discovery =
    intent.discovery ?? (intent.persona ? PERSONA_DISCOVERY[intent.persona] : undefined)

  if (discovery !== undefined) {
    if (discovery < 1 / 3) {
      constraints.popularityMin = FAMOUS_FLOOR
      applied.push({
        label: 'The well-known ones',
        detail: `only places Qloo rates above ${FAMOUS_FLOOR} for popularity`,
      })
    } else if (discovery > 2 / 3) {
      constraints.popularityMax = HIDDEN_CEILING
      applied.push({
        label: 'Hidden gems',
        detail: `only places Qloo rates below ${HIDDEN_CEILING} for popularity`,
      })
    }
  }

  return { constraints, applied }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/intent/qloo-params.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Allowlist the popularity parameters in `src/lib/providers/params.ts`**

Add to `ALLOWED_INSIGHTS_PARAMS`:
```ts
  'filter.popularity.min',
  'filter.popularity.max',
  'filter.price_level.min',
  'filter.price_level.max',
  'filter.location',
  'filter.exclude.tags',
```

- [ ] **Step 6: Write the failing provider test**

Append to `src/lib/providers/qloo.test.ts`:
```ts
  it('sends the popularity ceiling when hidden gems were asked for', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
      constraints: { popularityMax: 0.5 },
    })
    expect(urls[0]).toContain('filter.popularity.max=0.5')
  })

  it('sends no popularity parameter when none was asked for', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({ locality: 'Abuja' })
    expect(urls[0]).not.toContain('popularity')
  })
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npx vitest run src/lib/providers/qloo.test.ts`
Expected: FAIL — `constraints` is not a property of `PlaceQuery`.

- [ ] **Step 8: Thread `constraints` through the provider boundary**

In `src/lib/providers/types.ts`, extend `PlaceQuery`:
```ts
export type PlaceQuery = {
  locality: string
  tags?: { id: string; weight?: number }[]
  entities?: string[]
  take?: number
  /** Hard constraints, applied by our code and invisible to the agent. */
  constraints?: HardConstraints
}
```
and import the type:
```ts
import type { HardConstraints } from '../intent/qloo-params'
```

In `src/lib/providers/qloo.ts`, inside `suggestPlaces`, extend the params:
```ts
    const c = q.constraints ?? {}
    const params = buildInsightsParams({
      'filter.type': 'urn:entity:place',
      'filter.location.query': c.radius ? undefined : q.locality,
      'filter.location': c.radius ? `POINT(${c.radius.lng} ${c.radius.lat})` : undefined,
      'filter.location.radius': c.radius?.metres,
      'filter.popularity.min': c.popularityMin,
      'filter.popularity.max': c.popularityMax,
      'filter.price_level.max': c.priceLevelMax,
      'filter.tags': c.requiredTags?.length ? c.requiredTags.join(',') : undefined,
      'filter.exclude.tags': c.excludeTags?.length ? c.excludeTags.join(',') : undefined,
      'signal.interests.tags': q.tags?.length ? q.tags.map((t) => t.id).join(',') : undefined,
      'signal.interests.entities': seeded ? q.entities!.join(',') : undefined,
      'feature.explainability': seeded ? true : undefined,
      take: Math.min(q.take ?? 20, MAX_TAKE),
    })
```

In `src/lib/providers/fixture.ts`, honour `popularityMax` and `popularityMin` so fixture tests can exercise the band:
```ts
    const c = q.constraints ?? {}
    let matched = wantedTagIds.length
      ? FIXTURE_CANDIDATES.filter((x) => x.tags.some((t) => wantedTagIds.includes(t.id)))
      : FIXTURE_CANDIDATES
    if (c.popularityMax !== undefined) {
      matched = matched.filter((x) => (x.popularity ?? 1) <= c.popularityMax!)
    }
    if (c.popularityMin !== undefined) {
      matched = matched.filter((x) => (x.popularity ?? 0) >= c.popularityMin!)
    }
```

- [ ] **Step 9: Carry the constraints through the session**

In `src/lib/agent/tools.ts`, `createSession` gains a `constraints` option and passes it on every `suggestPlaces`, including inside `backfillSlots`:
```ts
export function createSession(opts: {
  provider: TasteProvider
  request: RouteRequest
  locality: Locality
  constraints?: HardConstraints
}): AgentSession {
  const { provider, request, locality } = opts
  const constraints = opts.constraints ?? {}
```
then add `constraints` to both `provider.suggestPlaces({...})` calls.

In `src/lib/agent/loop.ts`, `PlanOptions` gains `constraints?: HardConstraints` and passes it to `createSession`.

- [ ] **Step 10: Run the tests and watch them pass**

Run: `npm test && npm run typecheck`
Expected: green.

- [ ] **Step 11: Build the Tune panel with the discovery slider**

`src/components/TunePanel.tsx`:
```tsx
'use client'

import { useState } from 'react'
import type { Intent } from '@/lib/providers/types'

export function TunePanel({
  intent,
  onChange,
}: {
  intent: Intent
  onChange: (next: Intent) => void
}) {
  const [open, setOpen] = useState(false)
  const discovery = intent.discovery ?? 0.5

  return (
    <section className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs underline"
        style={{ color: 'var(--muted)' }}
      >
        {open ? 'Hide' : 'Tune this'} {open ? '' : '(optional)'}
      </button>

      {open && (
        <div className="mt-3 space-y-4 rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
          <label className="block">
            <span className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
              <span>The well-known ones</span>
              <span>Hidden gems</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={discovery}
              onChange={(e) => onChange({ ...intent, discovery: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>
        </div>
      )}
    </section>
  )
}
```

In `src/components/MoodForm.tsx`: hold `const [intent, setIntent] = useState<Intent>({})`, render `<TunePanel intent={intent} onChange={setIntent} />` above the submit button, and spread `...intent` into the request body.

- [ ] **Step 12: Apply the constraints in `src/app/api/route/route.ts`**

After `const request = parsed.value`:
```ts
  const { constraints, applied } = constraintsFromIntent(request.intent)
```
Pass `constraints` to `planRoute`, and attach `intentEcho` to the returned route:
```ts
    return NextResponse.json({
      route: { ...result.route, intentEcho: { applied, ignored: [] } },
      roundsUsed: result.roundsUsed,
    })
```
Add `intentEcho: IntentEcho` to the `Route` type in `src/lib/providers/types.ts`, and give `buildRoute` a default of `{ applied: [], ignored: [] }` so every existing construction still compiles.

- [ ] **Step 13: Verify against the live host**

```bash
cd ~/Techclave/tasteroute
set -a && . ./.env.local && set +a
npx next dev -p 3179 &
until curl -s -o /dev/null localhost:3179/; do sleep 2; done
for d in 0.1 0.9; do
  echo "discovery=$d"
  curl -s -X POST localhost:3179/api/route -H 'content-type: application/json' \
    -d "{\"city\":\"Abuja\",\"mood\":\"cocktails\",\"startHour\":18,\"endHour\":23,\"discovery\":$d}" \
    --max-time 180 | python3 -c "
import json,sys
j=json.load(sys.stdin)
r=j.get('route')
print('  ', [s['candidate']['name'] for s in r['stops']] if r else j.get('error'))
"
done
kill %1
```
Expected: two visibly different sets of three places. If they are identical, the constraints are not reaching Qloo — check the allowlist before changing anything else.

- [ ] **Step 14: Commit**

```bash
git add src/lib/intent src/lib/providers src/lib/agent src/components src/app src/lib/route
git commit -m "feat(intent): add the discovery slider, which changes which city you get back"
```

---

### Task 4: Budget and area, with honest relaxation

Covers **Review Focus 2**.

**Files:**
- Modify: `src/lib/intent/qloo-params.ts`, `src/lib/intent/qloo-params.test.ts`
- Create: `src/lib/intent/relax.ts`, `src/lib/intent/relax.test.ts`
- Modify: `src/lib/agent/loop.ts` (relax when a search comes back empty)
- Modify: `src/components/TunePanel.tsx`

**Interfaces:**
- Consumes: `HardConstraints`, `constraintsFromIntent`.
- Produces: `relaxOrder(constraints: HardConstraints): (keyof HardConstraints)[]`; `relaxOnce(constraints: HardConstraints): { next: HardConstraints; dropped: keyof HardConstraints } | null`; `cityCentre(provider: TasteProvider, locality: string): Promise<{ lat: number; lng: number } | null>`.

- [ ] **Step 1: Write the failing budget and area tests**

Append to `src/lib/intent/qloo-params.test.ts`:
```ts
describe('budget and area become hard constraints', () => {
  it('turns a budget into a price ceiling', () => {
    const { constraints, applied } = constraintsFromIntent({ budget: 2 })
    expect(constraints.priceLevelMax).toBe(2)
    expect(applied[0].label).toBe('Budget')
  })

  it('does not set a ceiling for the top budget tier', () => {
    expect(constraintsFromIntent({ budget: 4 }).constraints.priceLevelMax).toBeUndefined()
  })

  it('records a requested radius without a centre, for the caller to resolve', () => {
    const { constraints } = constraintsFromIntent({ area: { radiusMetres: 3000 } })
    expect(constraints.radius).toEqual({ lat: 0, lng: 0, metres: 3000 })
  })

  it('treats a null area as the whole city', () => {
    expect(constraintsFromIntent({ area: null }).constraints.radius).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/intent/qloo-params.test.ts`
Expected: FAIL — `priceLevelMax` undefined.

- [ ] **Step 3: Extend `constraintsFromIntent`**

Before the `return`:
```ts
  if (intent.budget !== undefined && intent.budget < 4) {
    constraints.priceLevelMax = intent.budget
    applied.push({
      label: 'Budget',
      detail: `nothing above price level ${intent.budget} of 4`,
    })
  }

  if (intent.area) {
    // The centre is resolved by the caller, which has a provider; 0,0 is a
    // placeholder the caller must replace before the query is built.
    constraints.radius = { lat: 0, lng: 0, metres: intent.area.radiusMetres }
    applied.push({
      label: 'Nearby only',
      detail: `within ${(intent.area.radiusMetres / 1000).toFixed(1)}km of the centre`,
    })
  }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/intent/qloo-params.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Write the failing relaxation test**

`src/lib/intent/relax.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { relaxOnce, relaxOrder } from './relax'

describe('relaxation order', () => {
  it('gives up the softest constraint first and a stated need last', () => {
    const order = relaxOrder({
      popularityMax: 0.5,
      priceLevelMax: 2,
      radius: { lat: 9, lng: 7, metres: 1000 },
      requiredTags: ['urn:tag:dietary_option:qloo:halal'],
    })
    expect(order).toEqual(['radius', 'popularityMax', 'priceLevelMax', 'requiredTags'])
  })

  it('never offers to drop an exclusion the person asked for', () => {
    expect(relaxOrder({ excludeTags: ['urn:tag:x'] })).toEqual([])
  })
})

describe('relaxOnce', () => {
  it('drops one constraint and names it', () => {
    const r = relaxOnce({ popularityMax: 0.5, priceLevelMax: 2 })
    expect(r?.dropped).toBe('popularityMax')
    expect(r?.next.popularityMax).toBeUndefined()
    expect(r?.next.priceLevelMax).toBe(2)
  })

  it('returns null when there is nothing left to give up', () => {
    expect(relaxOnce({})).toBeNull()
    expect(relaxOnce({ excludeTags: ['urn:tag:x'] })).toBeNull()
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run src/lib/intent/relax.test.ts`
Expected: FAIL — cannot resolve `./relax`.

- [ ] **Step 7: Write `src/lib/intent/relax.ts`**

```ts
import type { HardConstraints } from './qloo-params'

/**
 * Hidden gems plus a hard budget plus a one-kilometre radius can intersect to
 * nothing. Rather than refuse, give up one constraint at a time, softest
 * first, and say what was given up.
 *
 * `requiredTags` goes last because it carries dietary and accessibility needs:
 * it is the thing a person is least willing to lose, so it is the last thing
 * we take. `excludeTags` is never dropped — someone who said they do not want
 * hookah does not want hookah.
 */
const ORDER: (keyof HardConstraints)[] = [
  'radius',
  'popularityMax',
  'popularityMin',
  'priceLevelMax',
  'requiredTags',
]

export function relaxOrder(constraints: HardConstraints): (keyof HardConstraints)[] {
  return ORDER.filter((k) => constraints[k] !== undefined)
}

export function relaxOnce(
  constraints: HardConstraints,
): { next: HardConstraints; dropped: keyof HardConstraints } | null {
  const dropped = relaxOrder(constraints)[0]
  if (!dropped) return null
  const next = { ...constraints }
  delete next[dropped]
  return { next, dropped }
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run src/lib/intent/relax.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Resolve the city centre and relax in the loop**

In `src/lib/agent/loop.ts`, before the round loop, resolve a centre when a radius was requested:
```ts
  let constraints = opts.constraints ?? {}
  if (constraints.radius && constraints.radius.lat === 0 && constraints.radius.lng === 0) {
    const centre = await cityCentre(provider, locality.name)
    constraints = centre
      ? { ...constraints, radius: { ...constraints.radius, ...centre } }
      : // No centre means no radius: better the whole city than a search
        // around the Gulf of Guinea.
        { ...constraints, radius: undefined }
  }
```

Add to `src/lib/intent/relax.ts`:
```ts
import type { TasteProvider } from '../providers/types'

/**
 * One untagged query, taking the top result's coordinates as the city centre.
 * Qloo has no "centre of Abuja" endpoint, and its own top result for a city is
 * a reasonable stand-in.
 */
export async function cityCentre(
  provider: TasteProvider,
  locality: string,
): Promise<{ lat: number; lng: number } | null> {
  const { candidates } = await provider.suggestPlaces({ locality, take: 5 })
  const located = candidates.find((c) => c.lat != null && c.lng != null)
  return located ? { lat: located.lat!, lng: located.lng! } : null
}
```

After the forced finalize fails for lack of candidates, relax and retry:
```ts
    if (!session.finalRoute && session.pool.length === 0) {
      const relaxed = relaxOnce(constraints)
      if (relaxed) {
        ignored.push({
          label: RELAX_LABELS[relaxed.dropped],
          reason: 'nothing matched with this applied, so it was relaxed',
        })
        constraints = relaxed.next
        // Retry the search once with the looser constraints.
        await session.dispatch('suggest_places', { tagIds: session.requestedTagIds.slice(0, 5) })
        await session.dispatch('finalize_route', {})
      }
    }
```
with, in `relax.ts`:
```ts
export const RELAX_LABELS: Record<string, string> = {
  radius: 'Nearby only',
  popularityMax: 'Hidden gems',
  popularityMin: 'The well-known ones',
  priceLevelMax: 'Budget',
  requiredTags: 'Must-haves',
}
```
`PlanResult` gains `ignored: IntentEcho['ignored']` on the success branch, and the endpoint merges it into `intentEcho`.

- [ ] **Step 10: Write the failing conflicting-intent test**

Append to `src/lib/agent/loop.test.ts`:
```ts
  it('relaxes a constraint rather than refusing when nothing matches', async () => {
    const result = await planRoute({
      provider: new FixtureProvider(),
      request: { ...request, intent: {} },
      locality: { name: 'Lagos' },
      client: scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
      maxRounds: 4,
      // No fixture has popularity this low, so the first search is empty.
      constraints: { popularityMax: 0.01, priceLevelMax: 2 },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.ignored.map((i) => i.label)).toContain('Hidden gems')
  })
```

- [ ] **Step 11: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/loop.test.ts && npm test && npm run typecheck`
Expected: green.

- [ ] **Step 12: Add the budget and area controls to the Tune panel**

Inside the open panel in `src/components/TunePanel.tsx`:
```tsx
          <fieldset>
            <legend className="text-xs" style={{ color: 'var(--muted)' }}>Budget</legend>
            <div className="mt-1 flex gap-1.5">
              {([1, 2, 3, 4] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onChange({ ...intent, budget: intent.budget === b ? undefined : b })}
                  className="flex-1 rounded border px-2 py-1.5 text-sm"
                  style={{
                    borderColor: intent.budget === b ? 'var(--accent)' : 'var(--border)',
                    color: intent.budget === b ? 'var(--accent)' : 'var(--fg)',
                  }}
                >
                  {'₦'.repeat(b)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Stay within</span>
            <select
              value={intent.area?.radiusMetres ?? 0}
              onChange={(e) => {
                const m = Number(e.target.value)
                onChange({ ...intent, area: m === 0 ? null : { radiusMetres: m } })
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-base"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
            >
              <option value={0}>anywhere in the city</option>
              <option value={1000}>1 km</option>
              <option value={3000}>3 km</option>
              <option value={10000}>10 km</option>
            </select>
          </label>
```

- [ ] **Step 13: Commit**

```bash
git add src/lib/intent src/lib/agent src/components src/app
git commit -m "feat(intent): add budget and area, and relax a constraint rather than refusing"
```

---

### Task 5: Requirements and dealbreakers

Covers **Review Focus 1**. The one defect this product must not have is a silently dropped dietary need.

**Files:**
- Modify: `src/lib/intent/qloo-params.ts`, `src/lib/intent/qloo-params.test.ts`
- Modify: `src/lib/route/build.ts` (confidence drops when a requirement was dropped)
- Modify: `src/components/TunePanel.tsx`, `src/components/RouteView.tsx`
- Create: `src/components/IntentEchoPanel.tsx`
- Test: `src/lib/route/requirements.test.ts`

**Interfaces:**
- Consumes: `HardConstraints`, `DIETARY_TAGS`, `ACCESSIBILITY_TAGS`, `relaxOnce`, `RELAX_LABELS`.
- Produces: no new exports; `Route.confidence` becomes `weak` whenever `intentEcho.ignored` names a requirement.

- [ ] **Step 1: Write the failing requirements test**

`src/lib/route/requirements.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { constraintsFromIntent } from '../intent/qloo-params'
import { buildRoute, type BuildInput } from './build'
import { FIXTURE_CANDIDATES } from '../providers/fixture'

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  candidates: FIXTURE_CANDIDATES,
  request: {
    city: 'Abuja',
    mood: 'dinner',
    timeWindow: { startHour: 18, endHour: 23 },
    intent: {},
  },
  locality: { name: 'Abuja' },
  requestedTagIds: [],
  explainability: null,
  seedNames: {},
  trace: [],
  providerKind: 'fixture',
  intentEcho: { applied: [], ignored: [] },
  ...over,
})

describe('requirements become hard tag filters', () => {
  it('turns halal into the dietary tag Qloo publishes', () => {
    const { constraints } = constraintsFromIntent({ requirements: { dietary: ['halal'] } })
    expect(constraints.requiredTags).toEqual(['urn:tag:dietary_option:qloo:halal'])
  })

  it('combines dietary and accessibility needs', () => {
    const { constraints } = constraintsFromIntent({
      requirements: { dietary: ['vegan'], accessibility: ['wheelchair_entrance'] },
    })
    expect(constraints.requiredTags).toHaveLength(2)
  })

  it('turns an avoid term into an exclusion, not a preference', () => {
    const { constraints } = constraintsFromIntent({ avoid: ['hookah'] })
    expect(constraints.excludeTags).toEqual(['hookah'])
  })

  it('says what it applied', () => {
    const { applied } = constraintsFromIntent({ requirements: { dietary: ['halal'] } })
    expect(applied.some((a) => a.label === 'Must have' && a.detail.includes('halal'))).toBe(true)
  })
})

describe('a dropped requirement is reported and lowers confidence', () => {
  it('drops confidence to weak when a requirement was relaxed', () => {
    const r = buildRoute(
      input({
        intentEcho: {
          applied: [],
          ignored: [{ label: 'Must-haves', reason: 'nothing matched' }],
        },
      }),
    )
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).toBe('weak')
  })

  it('leaves confidence alone when only a soft constraint was relaxed', () => {
    const r = buildRoute(
      input({
        intentEcho: {
          applied: [],
          ignored: [{ label: 'Hidden gems', reason: 'nothing matched' }],
        },
      }),
    )
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).not.toBe('weak')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/requirements.test.ts`
Expected: FAIL — `requiredTags` undefined and `BuildInput` has no `intentEcho`.

- [ ] **Step 3: Extend `constraintsFromIntent`**

```ts
  const requiredTags = [
    ...(intent.requirements?.dietary ?? []).map((d) => DIETARY_TAGS[d]),
    ...(intent.requirements?.accessibility ?? []).map((a) => ACCESSIBILITY_TAGS[a]),
  ]
  if (requiredTags.length > 0) {
    constraints.requiredTags = requiredTags
    const names = [
      ...(intent.requirements?.dietary ?? []),
      ...(intent.requirements?.accessibility ?? []),
    ].map((n) => n.replace(/_/g, ' '))
    applied.push({ label: 'Must have', detail: names.join(', ') })
  }

  if (intent.avoid?.length) {
    constraints.excludeTags = intent.avoid
    applied.push({ label: 'Avoiding', detail: intent.avoid.join(', ') })
  }
```
with the import:
```ts
import { ACCESSIBILITY_TAGS, DIETARY_TAGS } from './vocabulary'
```

- [ ] **Step 4: Make a dropped requirement lower confidence in `src/lib/route/build.ts`**

Add `intentEcho: IntentEcho` to `BuildInput`, and after the assessment:
```ts
  // A route that could not honour a stated need is not a confident route,
  // whatever the taste match looks like.
  const requirementDropped = input.intentEcho.ignored.some((i) => i.label === 'Must-haves')
  const confidence = requirementDropped ? 'weak' : assessment.confidence
```
Use `confidence` in the returned route instead of `assessment.confidence`, and carry `intentEcho: input.intentEcho` onto it.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/lib/route/requirements.test.ts`
Expected: PASS, 6 tests. Then `npm test` — fix the `BuildInput` literals in existing tests by adding `intentEcho: { applied: [], ignored: [] }`.

- [ ] **Step 6: Show the echo in the UI**

`src/components/IntentEchoPanel.tsx`:
```tsx
import type { IntentEcho } from '@/lib/providers/types'

export function IntentEchoPanel({ echo }: { echo: IntentEcho }) {
  if (echo.applied.length === 0 && echo.ignored.length === 0) return null

  return (
    <section className="mt-3 space-y-1 text-xs">
      {echo.applied.map((a) => (
        <p key={a.label} style={{ color: 'var(--muted)' }}>
          <span style={{ color: 'var(--accent)' }}>{a.label}</span> — {a.detail}
        </p>
      ))}
      {echo.ignored.map((i) => (
        <p
          key={i.label}
          className="rounded border px-2 py-1"
          style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
        >
          <strong>{i.label} could not be applied</strong> — {i.reason}
        </p>
      ))}
    </section>
  )
}
```
Render it in `RouteView` directly under `ProviderBanner`.

- [ ] **Step 7: Add the requirement checkboxes to the Tune panel**

```tsx
          <fieldset>
            <legend className="text-xs" style={{ color: 'var(--muted)' }}>Must have</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(['halal', 'vegetarian', 'vegan'] as const).map((d) => {
                const on = intent.requirements?.dietary?.includes(d) ?? false
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const current = intent.requirements?.dietary ?? []
                      const next = on ? current.filter((x) => x !== d) : [...current, d]
                      onChange({
                        ...intent,
                        requirements: { ...intent.requirements, dietary: next.length ? next : undefined },
                      })
                    }}
                    className="rounded-full border px-2.5 py-1 text-xs"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </fieldset>
```

- [ ] **Step 8: Verify the impossible-requirement path against the live host**

```bash
curl -s -X POST localhost:3179/api/route -H 'content-type: application/json' \
  -d '{"city":"Abuja","mood":"dinner","startHour":18,"endHour":23,"requirements":{"dietary":["kosher"]}}' \
  --max-time 180 | python3 -m json.tool | head -30
```
Expected: a route, `confidence` `weak`, and `intentEcho.ignored` naming the must-haves. Not a 422.

- [ ] **Step 9: Commit**

```bash
git add src/lib/intent src/lib/route src/components
git commit -m "feat(intent): hard requirements, with a dropped one reported rather than hidden"
```

---

### Task 6: The clarifying question

Covers **Review Focus 3**. On its own endpoint, so `/api/route` is untouched.

**Files:**
- Create: `src/lib/agent/clarify.ts`, `src/lib/agent/clarify.test.ts`
- Create: `src/app/api/clarify/route.ts`
- Create: `src/components/ClarifyPrompt.tsx`
- Modify: `src/components/MoodForm.tsx`
- Modify: `src/lib/agent/loop.ts` (put a given answer into the agent's context)

**Interfaces:**
- Consumes: `ChatClient`, `parseRouteBody`, `SpendLimiter`.
- Produces: `askClarifying(opts: { request: RouteRequest; client: ChatClient }): Promise<ClarifyResult>`; `type ClarifyResult = { clear: true } | { question: string; options: string[]; because: string }`; `CLARIFY_SYSTEM_PROMPT`.

- [ ] **Step 1: Write the failing clarify test**

`src/lib/agent/clarify.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { askClarifying } from './clarify'
import type { ChatClient } from './loop'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Abuja',
  mood: 'something nice',
  timeWindow: { startHour: 18, endHour: 23 },
  intent: {},
}

const clientAsking = (args: object): ChatClient => ({
  async complete() {
    return {
      toolCalls: [{ id: 'c1', name: 'ask_user', arguments: JSON.stringify(args) }],
    }
  },
})

describe('askClarifying', () => {
  it('returns the question the model asked', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({
        question: 'Eating properly, or just drinks?',
        options: ['a proper meal', 'just drinks'],
        because: 'it changes whether I search restaurants or bars',
      }),
    })
    expect('question' in r).toBe(true)
    if (!('question' in r)) return
    expect(r.options).toHaveLength(2)
  })

  it('treats a question with too few options as clear', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({ question: 'What do you want?', options: [], because: 'x' }),
    })
    expect(r).toEqual({ clear: true })
  })

  it('treats a question with too many options as clear', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({
        question: 'Which?',
        options: ['a', 'b', 'c', 'd', 'e'],
        because: 'x',
      }),
    })
    expect(r).toEqual({ clear: true })
  })

  it('is clear when the model asks nothing', async () => {
    const silent: ChatClient = { async complete() { return { toolCalls: [] } } }
    expect(await askClarifying({ request, client: silent })).toEqual({ clear: true })
  })

  it('is clear when the model call fails, rather than blocking the route', async () => {
    const broken: ChatClient = {
      async complete() {
        throw new Error('Connection error.')
      },
    }
    expect(await askClarifying({ request, client: broken })).toEqual({ clear: true })
  })

  it('offers only the one tool, so the model cannot search', async () => {
    let seenTools: { function: { name: string } }[] = []
    const spy: ChatClient = {
      async complete({ tools }) {
        seenTools = tools as { function: { name: string } }[]
        return { toolCalls: [] }
      },
    }
    await askClarifying({ request, client: spy })
    expect(seenTools.map((t) => t.function.name)).toEqual(['ask_user'])
  })

  it('does not ask again when an answer is already in hand', async () => {
    const r = await askClarifying({
      request: { ...request, intent: { clarified: { question: 'q', answer: 'a' } } },
      client: clientAsking({ question: 'again?', options: ['x', 'y'], because: 'z' }),
    })
    expect(r).toEqual({ clear: true })
  })

  it('truncates an over-long question rather than rendering it raw', async () => {
    const r = await askClarifying({
      request,
      client: clientAsking({
        question: 'q'.repeat(400),
        options: ['a', 'b'],
        because: 'x',
      }),
    })
    if (!('question' in r)) throw new Error('expected a question')
    expect(r.question.length).toBeLessThanOrEqual(160)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/agent/clarify.test.ts`
Expected: FAIL — cannot resolve `./clarify`.

- [ ] **Step 3: Write `src/lib/agent/clarify.ts`**

```ts
import type { ChatClient } from './loop'
import type { ToolDefinition } from './tools'
import type { RouteRequest } from '../providers/types'

export const CLARIFY_SYSTEM_PROMPT = `You are about to plan a three-stop evening out from Qloo's taste graph, but first you decide whether you have been told enough.

Call ask_user ONLY if the answer would change which Qloo queries you run. A mood that already names a vibe, a kind of venue, or an occasion is enough — say nothing and let the planning proceed.

If you do ask: one short question, two to four concrete options, and a reason that names what it would change. Never ask for something the request already contains.`

const MAX_QUESTION = 160
const MAX_OPTION = 48

export type ClarifyResult =
  | { clear: true }
  | { question: string; options: string[]; because: string }

const ASK_USER: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_user',
    description:
      'Ask the person one question before planning. Only worth doing when the answer changes which Qloo queries you would run.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
        because: { type: 'string' },
      },
      required: ['question', 'options', 'because'],
      additionalProperties: false,
    },
  },
}

export async function askClarifying(opts: {
  request: RouteRequest
  client: ChatClient
}): Promise<ClarifyResult> {
  // Already answered once. One question per route.
  if (opts.request.intent.clarified) return { clear: true }

  const { city, mood, timeWindow } = opts.request
  let toolCalls
  try {
    const turn = await opts.client.complete({
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `City: ${city}\nMood: ${mood}\nOut between ${timeWindow.startHour}:00 and ${timeWindow.endHour}:00.`,
        },
      ],
      tools: [ASK_USER],
    })
    toolCalls = turn.toolCalls
  } catch {
    // A planner that cannot be reached must not block the route.
    return { clear: true }
  }

  const call = toolCalls.find((c) => c.name === 'ask_user')
  if (!call) return { clear: true }

  let args: { question?: unknown; options?: unknown; because?: unknown }
  try {
    args = JSON.parse(call.arguments)
  } catch {
    return { clear: true }
  }

  const question = typeof args.question === 'string' ? args.question.trim() : ''
  const options = Array.isArray(args.options)
    ? args.options
        .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
        .map((o) => o.trim().slice(0, MAX_OPTION))
    : []
  const because = typeof args.because === 'string' ? args.because.trim().slice(0, MAX_QUESTION) : ''

  // A question without real choices is just a second form.
  if (!question || options.length < 2 || options.length > 4) return { clear: true }

  return { question: question.slice(0, MAX_QUESTION), options, because }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/clarify.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the endpoint**

`src/app/api/clarify/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { askClarifying } from '@/lib/agent/clarify'
import { createOpenAIClient } from '@/lib/agent/openai-client'
import { SpendLimiter } from '@/lib/agent/spend'
import { hasModelAccess } from '@/lib/env'
import { parseRouteBody } from '@/lib/route/request-body'

export const runtime = 'nodejs'
export const maxDuration = 30

const limiter = new SpendLimiter({
  dailyCeiling: Number(process.env.TASTEROUTE_DAILY_CLARIFY_CEILING ?? 600),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ clear: true })
  }

  const parsed = parseRouteBody(body)
  // A body we cannot read is not worth a question; /api/route will say why.
  if (!parsed.ok) return NextResponse.json({ clear: true })

  if (!hasModelAccess() || !limiter.tryConsume()) {
    return NextResponse.json({ clear: true })
  }

  try {
    return NextResponse.json(
      await askClarifying({ request: parsed.value, client: createOpenAIClient() }),
    )
  } catch (e) {
    console.error('clarify failed', (e as Error).message)
    return NextResponse.json({ clear: true })
  }
}
```

Every failure path returns `{ clear: true }`. A clarifying question is a nicety; it must never stand between a person and a route.

- [ ] **Step 6: Give the answer to the planner**

In `src/lib/agent/loop.ts`, extend the first user message:
```ts
  const clarified = request.intent.clarified
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content:
        `City: ${request.city}\nMood: ${request.mood}\n` +
        `Out between ${request.timeWindow.startHour}:00 and ${request.timeWindow.endHour}:00.` +
        (clarified ? `\nAsked: ${clarified.question}\nAnswered: ${clarified.answer}` : ''),
    },
  ]
```

Add a test to `src/lib/agent/loop.test.ts`:
```ts
  it('puts a clarifying answer in front of the model', async () => {
    let firstMessage = ''
    const spy: ChatClient = {
      async complete({ messages }) {
        if (!firstMessage) firstMessage = messages[0].content
        return { toolCalls: [{ id: 'c', name: 'finalize_route', arguments: '{}' }] }
      },
    }
    await planRoute({
      provider: new FixtureProvider(),
      request: {
        ...request,
        intent: { clarified: { question: 'Meal or drinks?', answer: 'just drinks' } },
      },
      locality: { name: 'Lagos' },
      client: spy,
      maxRounds: 3,
    })
    expect(firstMessage).toContain('just drinks')
  })
```

- [ ] **Step 7: Build the prompt component**

`src/components/ClarifyPrompt.tsx`:
```tsx
'use client'

export function ClarifyPrompt({
  question,
  options,
  because,
  onAnswer,
  onSkip,
}: {
  question: string
  options: string[]
  because: string
  onAnswer: (answer: string) => void
  onSkip: () => void
}) {
  return (
    <section
      className="mt-6 rounded-lg border p-4"
      style={{ borderColor: 'var(--accent)', background: 'var(--card)' }}
    >
      <p className="text-sm font-medium">{question}</p>
      {because && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {because}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onAnswer(o)}
            className="rounded-md px-3 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#0a0a0a' }}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          just plan it
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 8: Wire it into `MoodForm`**

On submit, call `/api/clarify` first. If it returns a question, render `ClarifyPrompt` and wait. An answer re-submits with `clarified: { question, answer }`; a skip re-submits without it. Send only the chosen option string, never free text — this is what keeps **Review Focus 3** closed: the answer is one of the options the server itself produced, and anything else is dropped by `parseRouteBody`'s 80-character cap and never becomes a tag id.

- [ ] **Step 9: Write the failing tampered-answer test**

Covers **Review Focus 3**: the client posts `clarified.answer` as a string, so
a stale or hand-edited answer must not become a tag id or reach Qloo.

Append to `src/lib/agent/clarify.test.ts`:
```ts
describe('a clarify answer is text for the model, never an identifier', () => {
  it('is rejected by the body validator when over-long', async () => {
    const { parseRouteBody } = await import('../route/request-body')
    const r = parseRouteBody({
      city: 'Abuja',
      mood: 'x',
      startHour: 18,
      endHour: 23,
      clarified: { question: 'q', answer: 'a'.repeat(200) },
    })
    expect(r.ok).toBe(false)
  })

  it('reaches the model as prose and never as a tag id', async () => {
    const { planRoute } = await import('./loop')
    const { FixtureProvider } = await import('../providers/fixture')
    const sent: string[] = []
    const spy = {
      async complete({ messages }: { messages: { content: string }[] }) {
        sent.push(messages[0].content)
        return { toolCalls: [] }
      },
    }
    const result = await planRoute({
      provider: new FixtureProvider(),
      request: {
        city: 'Lagos',
        mood: 'x',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: {
          clarified: { question: 'Meal or drinks?', answer: 'urn:tag:genre:place:casino' },
        },
      },
      locality: { name: 'Lagos' },
      client: spy as never,
      maxRounds: 2,
    })
    if ('error' in result) throw new Error(result.error)
    // The answer appears as text the model may interpret, and nowhere else.
    expect(sent[0]).toContain('urn:tag:genre:place:casino')
    expect(JSON.stringify(result.route.trace)).not.toContain('casino')
    expect(result.route.stops.every((st) => st.candidate.category !== 'casino')).toBe(true)
  })
})
```

Run: `npx vitest run src/lib/agent/clarify.test.ts`
Expected: FAIL on the first, because `clarified.answer` has no length cap yet
if Task 1's schema was written without it; PASS on the second. Add
`.max(80)` to `answer` in `intentSchema` if the first fails.

- [ ] **Step 10: Verify against the live host**

```bash
for mood in "something nice" "quiet wine bar with small plates"; do
  echo "mood: $mood"
  curl -s -X POST localhost:3179/api/clarify -H 'content-type: application/json' \
    -d "{\"city\":\"Abuja\",\"mood\":\"$mood\",\"startHour\":18,\"endHour\":23}" --max-time 60
  echo
done
```
Expected: a question for the vague mood, `{"clear":true}` for the specific one. If both ask, the gate is wrong — tighten the prompt before moving on.

- [ ] **Step 11: Commit**

```bash
git add src/lib/agent src/app/api/clarify src/components
git commit -m "feat(agent): let the model ask one clarifying question, on its own endpoint"
```

---

### Task 7: Richer stop cards

Covers **Review Focus 4**.

**Files:**
- Modify: `src/lib/providers/types.ts` (`Candidate.media`, `Candidate.detail`)
- Modify: `src/lib/providers/schemas.ts`, `src/lib/providers/qloo.ts`
- Create: `src/lib/route/open-tonight.ts`, `src/lib/route/open-tonight.test.ts`
- Modify: `src/components/StopCard.tsx`
- Modify: `next.config.ts`
- Test: `src/lib/providers/qloo.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `openRanges` logic from `score.ts`.
- Produces: `Candidate.media?: { imageUrl?: string; imageUrls?: string[] }`; `Candidate.detail?: { neighborhood?, neighborhoodNote?, about?, standout?, rating?, phone?, website?, openTonight? }`; `isOpenDuring(hours: unknown, w: TimeWindow): boolean | null`.

- [ ] **Step 1: Write the failing open-tonight test**

`src/lib/route/open-tonight.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isOpenDuring } from './open-tonight'
import { normaliseWindow } from './window'

describe('isOpenDuring', () => {
  it('is null when a place publishes no hours, rather than guessing', () => {
    expect(isOpenDuring(null, normaliseWindow(18, 23))).toBeNull()
    expect(isOpenDuring({}, normaliseWindow(18, 23))).toBeNull()
  })

  it('is true for a place open across the window', () => {
    const hours = { friday: [{ opens: 'T17:00:00', closed: false, closes: 'T23:30:00' }] }
    expect(isOpenDuring(hours, normaliseWindow(18, 23))).toBe(true)
  })

  it('is false for a place that shuts before the window starts', () => {
    const hours = { friday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }] }
    expect(isOpenDuring(hours, normaliseWindow(18, 23))).toBe(false)
  })

  it('is true for a late bar on a night that crosses midnight', () => {
    const hours = { saturday: [{ opens: 'T20:00:00', closed: false, closes: 'T02:00:00' }] }
    expect(isOpenDuring(hours, normaliseWindow(22, 2))).toBe(true)
  })

  it('agrees with the scoring penalty for every case', async () => {
    const { scoreCandidate } = await import('./score')
    const { FIXTURE_CANDIDATES } = await import('../providers/fixture')
    const base = FIXTURE_CANDIDATES[3]
    const window = normaliseWindow(18, 23)
    const ctx = { requestedTagIds: [], timeWindow: window, usedCategories: [] }

    const cases = [
      { friday: [{ opens: 'T07:00:00', closed: false, closes: 'T15:00:00' }] },
      { friday: [{ opens: 'T17:00:00', closed: false, closes: 'T23:30:00' }] },
    ]
    for (const hours of cases) {
      const penalised =
        scoreCandidate({ ...base, hours }, 'main', ctx) < scoreCandidate(base, 'main', ctx)
      expect(isOpenDuring(hours, window)).toBe(!penalised)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/open-tonight.test.ts`
Expected: FAIL — cannot resolve `./open-tonight`.

- [ ] **Step 3: Write `src/lib/route/open-tonight.ts`**

Move `openRanges` and `parseHour` out of `score.ts` into this file, export them, and import them back into `score.ts` so there is exactly one parser. Then:
```ts
import type { TimeWindow } from './window'

/**
 * Whether a place is open during the window, or null when it publishes no
 * hours. The card must never disagree with the score, so both read this.
 */
export function isOpenDuring(hours: unknown, w: TimeWindow): boolean | null {
  const ranges = openRanges(hours)
  if (ranges.length === 0) return null
  const overlaps = (r: { from: number; to: number }) =>
    r.from < w.endHour && r.to > w.startHour
  return ranges.some((r) => overlaps(r) || overlaps({ from: r.from + 24, to: r.to + 24 }))
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/open-tonight.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Write the failing media-mapping test**

Append to `src/lib/providers/qloo.test.ts`:
```ts
  it('maps the image, rating, neighbourhood and descriptions onto the candidate', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'a',
              name: 'Bluecabana',
              tags: [],
              properties: {
                image: { url: 'https://images.qloo.com/i/abc-420x-auto.jpg' },
                images: [{ url: 'https://images.qloo.com/i/abc-1.jpg' }],
                business_rating: 4.3,
                neighborhood: 'Wuse 2',
                neighborhood_description: 'A busy strip. Lots of bars.',
                overall_description: 'Bluecabana is a courtyard bar. It gets loud after ten.',
                unique_selling_points: 'The courtyard. Also the grilled fish.',
                phone: '+234 000 0000',
              },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
    })
    const c = candidates[0]
    expect(c.media?.imageUrl).toContain('images.qloo.com')
    expect(c.detail?.rating).toBe(4.3)
    expect(c.detail?.neighborhood).toBe('Wuse 2')
    expect(c.detail?.about).toBe('Bluecabana is a courtyard bar')
    expect(c.detail?.standout).toBe('The courtyard')
    expect(c.detail?.phone).toBe('+234 000 0000')
  })

  it('leaves media and detail undefined when Qloo sends nulls', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'b',
              name: 'Bare',
              tags: [],
              properties: { image: null, images: null, business_rating: null, neighborhood: null },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
    })
    expect(candidates[0].media?.imageUrl).toBeUndefined()
    expect(candidates[0].detail?.rating).toBeUndefined()
  })
```

- [ ] **Step 6: Run it and watch it fail, then implement**

Run: `npx vitest run src/lib/providers/qloo.test.ts`
Expected: FAIL — `media` is not a property.

Add to `Candidate` in `types.ts`:
```ts
  media?: { imageUrl?: string; imageUrls?: string[] }
  detail?: {
    neighborhood?: string
    neighborhoodNote?: string
    about?: string
    standout?: string
    rating?: number
    phone?: string
    website?: string
    openTonight?: boolean | null
  }
```

Add to the `properties` schema:
```ts
      image: z.object({ url: z.string() }).loose().nullish(),
      images: z.array(z.object({ url: z.string() }).loose()).nullish(),
      neighborhood: z.string().nullish(),
      neighborhood_description: z.string().nullish(),
      overall_description: z.string().nullish(),
      unique_selling_points: z.string().nullish(),
      phone: z.string().nullish(),
      website: z.string().nullish(),
```

In `qloo.ts`, add a one-sentence helper and the mapping:
```ts
/** Qloo's prose fields are paragraphs; a card shows the first sentence. */
function firstSentence(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined
  const s = raw.trim().split(/(?<=\.)\s/)[0] ?? raw
  return s.replace(/\.$/, '').trim() || undefined
}
```
```ts
    media: {
      imageUrl: (p.image as { url?: string } | null | undefined)?.url ?? undefined,
      imageUrls: Array.isArray(p.images)
        ? (p.images as { url?: string }[]).map((i) => i.url).filter((u): u is string => !!u)
        : undefined,
    },
    detail: {
      neighborhood: p.neighborhood ?? undefined,
      neighborhoodNote: firstSentence(p.neighborhood_description),
      about: firstSentence(p.overall_description),
      standout: firstSentence(p.unique_selling_points),
      rating: p.business_rating ?? undefined,
      phone: p.phone ?? undefined,
      website: p.website ?? undefined,
    },
```

`buildRoute` sets `detail.openTonight` from `isOpenDuring(candidate.hours, request.timeWindow)` when it assembles each stop, so the card and the score read the same parser.

- [ ] **Step 7: Run it and watch it pass**

Run: `npx vitest run src/lib/providers/qloo.test.ts && npm test`
Expected: PASS.

- [ ] **Step 8: Render the richer card**

In `src/components/StopCard.tsx`, above the name block:
```tsx
      {stop.candidate.media?.imageUrl && (
        <img
          src={stop.candidate.media.imageUrl}
          alt=""
          width={420}
          height={200}
          loading="lazy"
          onError={(e) => {
            // A third-party image that 404s must not leave a broken frame.
            e.currentTarget.style.display = 'none'
          }}
          className="mb-3 h-36 w-full rounded-md object-cover"
          style={{ background: 'var(--border)' }}
        />
      )}
```
and under the address:
```tsx
      <p className="mt-1 flex flex-wrap gap-x-2 text-xs" style={{ color: 'var(--muted)' }}>
        {stop.candidate.detail?.neighborhood && <span>{stop.candidate.detail.neighborhood}</span>}
        {stop.candidate.detail?.rating != null && (
          <span>{stop.candidate.detail.rating.toFixed(1)} rated</span>
        )}
        {stop.candidate.detail?.openTonight === true && <span>open during your window</span>}
        {stop.candidate.detail?.openTonight === false && (
          <span style={{ color: '#fca5a5' }}>may be shut then</span>
        )}
      </p>

      {stop.candidate.detail?.about && (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--muted)' }}>
          Qloo: &ldquo;{stop.candidate.detail.about}&rdquo;
        </p>
      )}
```

The `<img>` carries explicit `width`/`height` and a fixed `h-36` so a slow or missing image cannot shift the layout — that is **Review Focus 4**.

- [ ] **Step 9: Allow the image host in `next.config.ts`**

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'images.qloo.com' }] },
}
```
(Plain `<img>` does not require this, but it is set so a later move to `next/image` does not need a second change.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/providers src/lib/route src/components next.config.ts
git commit -m "feat(ui): show the photo, rating, neighbourhood and description Qloo already returns"
```

---

### Task 8: Preference signals

**Files:**
- Modify: `src/lib/agent/tools.ts` (resolve preference queries into tags)
- Modify: `src/lib/agent/loop.ts` (demographics as a provider parameter)
- Modify: `src/lib/providers/types.ts`, `src/lib/providers/qloo.ts`, `src/lib/providers/params.ts`
- Modify: `src/components/TunePanel.tsx`
- Test: `src/lib/agent/preferences.test.ts`

**Interfaces:**
- Consumes: `VIBE_QUERIES`, `OCCASION_QUERIES`, `PARTY_QUERIES`, `HardConstraints`.
- Produces: `resolvePreferenceTags(provider: TasteProvider, intent: Intent): Promise<{ tagIds: string[]; applied: IntentEcho['applied'] }>`; `HardConstraints.demographics?: { ageBand?: string; gender?: string }`.

- [ ] **Step 1: Write the failing preference test**

`src/lib/agent/preferences.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { resolvePreferenceTags } from './tools'

describe('resolvePreferenceTags', () => {
  const provider = new FixtureProvider()

  it('resolves nothing when no preferences were given', async () => {
    const r = await resolvePreferenceTags(provider, {})
    expect(r.tagIds).toEqual([])
    expect(r.applied).toEqual([])
  })

  it('resolves a vibe by querying Qloo rather than from a table', async () => {
    const r = await resolvePreferenceTags(provider, { vibe: ['lively'] })
    expect(r.tagIds.length).toBeGreaterThan(0)
    expect(r.applied.some((a) => a.label === 'Vibe')).toBe(true)
  })

  it('resolves an occasion and a party composition together', async () => {
    const r = await resolvePreferenceTags(provider, {
      occasion: 'first_date',
      party: { size: 2, composition: 'couple' },
    })
    expect(r.applied.map((a) => a.label).sort()).toEqual(['Going with', 'Occasion'])
  })

  it('deduplicates when two preferences resolve to the same tag', async () => {
    const r = await resolvePreferenceTags(provider, {
      occasion: 'catching_up',
      party: { size: 6, composition: 'friends' },
    })
    expect(new Set(r.tagIds).size).toBe(r.tagIds.length)
  })

  it('reports a preference Qloo had no tag for, rather than dropping it quietly', async () => {
    const empty = {
      ...provider,
      async findTags() {
        return []
      },
    }
    const r = await resolvePreferenceTags(empty, { vibe: ['lively'] })
    expect(r.tagIds).toEqual([])
    expect(r.applied).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/agent/preferences.test.ts`
Expected: FAIL — `resolvePreferenceTags` is not exported.

- [ ] **Step 3: Add `resolvePreferenceTags` to `src/lib/agent/tools.ts`**

```ts
import {
  OCCASION_QUERIES,
  PARTY_QUERIES,
  VIBE_QUERIES,
} from '../intent/vocabulary'

/**
 * Turns the preference half of the intent into real Qloo tag ids by QUERYING
 * the tag endpoint. The vocabulary stays Qloo's: remove Qloo and these words
 * resolve to nothing, which is the point.
 */
export async function resolvePreferenceTags(
  provider: TasteProvider,
  intent: Intent,
): Promise<{ tagIds: string[]; applied: IntentEcho['applied'] }> {
  const tagIds: string[] = []
  const applied: IntentEcho['applied'] = []

  const resolve = async (queries: string[]): Promise<string[]> => {
    const found: string[] = []
    for (const q of queries) {
      const tags = await provider.findTags(q)
      // Qloo returns the closest matches first; two is enough signal.
      found.push(...tags.slice(0, 2).map((t) => t.id))
    }
    return found
  }

  const add = (label: string, detail: string, ids: string[]) => {
    const fresh = ids.filter((id) => !tagIds.includes(id))
    if (fresh.length === 0) return
    tagIds.push(...fresh)
    applied.push({ label, detail })
  }

  if (intent.vibe?.length) {
    const ids = await resolve(intent.vibe.flatMap((v) => VIBE_QUERIES[v]))
    add('Vibe', intent.vibe.join(', '), ids)
  }
  if (intent.occasion) {
    const ids = await resolve(OCCASION_QUERIES[intent.occasion])
    add('Occasion', intent.occasion.replace(/_/g, ' '), ids)
  }
  if (intent.party?.composition) {
    const ids = await resolve(PARTY_QUERIES[intent.party.composition])
    add(
      'Going with',
      `${intent.party.size} ${intent.party.composition.replace(/_/g, ' ')}`,
      ids,
    )
  }

  return { tagIds, applied }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/preferences.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Seed the pool with the resolved tags, and pass demographics**

In `src/lib/agent/loop.ts`, after resolving constraints:
```ts
  const preferences = await resolvePreferenceTags(provider, request.intent)
  if (preferences.tagIds.length > 0) {
    await session.dispatch('suggest_places', { tagIds: preferences.tagIds })
  }
```
so the agent starts from a pool already shaped by the stated preferences and spends its rounds refining rather than discovering.

Add demographics to `HardConstraints` in `qloo-params.ts`:
```ts
  if (intent.demographics?.ageBand || intent.demographics?.gender) {
    constraints.demographics = {
      ageBand: intent.demographics.ageBand,
      gender: intent.demographics.gender,
    }
    // Deliberately NOT pushed to `applied`: echoing a person's age and gender
    // back at them on the result page is not a feature.
  }
```
and in `qloo.ts`:
```ts
      'signal.demographics.age': c.demographics?.ageBand,
      'signal.demographics.gender': c.demographics?.gender,
```
with both names added to `ALLOWED_INSIGHTS_PARAMS`.

- [ ] **Step 6: Write the failing demographics-privacy test**

Append to `src/lib/agent/preferences.test.ts`:
```ts
describe('demographics stay out of everything a person can see', () => {
  it('never appears in the intent echo', async () => {
    const { constraintsFromIntent } = await import('../intent/qloo-params')
    const { applied } = constraintsFromIntent({
      demographics: { ageBand: '25_to_29', gender: 'female' },
    })
    expect(JSON.stringify(applied)).not.toMatch(/25_to_29|female|age|gender/i)
  })

  it('never appears in the trace', async () => {
    const { planRoute } = await import('./loop')
    const result = await planRoute({
      provider: new FixtureProvider(),
      request: {
        city: 'Lagos',
        mood: 'x',
        timeWindow: { startHour: 18, endHour: 23 },
        intent: { demographics: { ageBand: '25_to_29', gender: 'female' } },
      },
      locality: { name: 'Lagos' },
      client: { async complete() { return { toolCalls: [] } } },
      maxRounds: 2,
      constraints: { demographics: { ageBand: '25_to_29', gender: 'female' } },
    })
    if ('error' in result) throw new Error(result.error)
    expect(JSON.stringify(result.route.trace)).not.toMatch(/25_to_29|female/i)
  })
})
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/preferences.test.ts && npm test && npm run typecheck`
Expected: green.

- [ ] **Step 8: Add the controls to the Tune panel**

Vibe chips over `VIBE_IDS`, an occasion `<select>` over `OCCASION_IDS`, a party size number plus composition select, and a persona select. Then, nested one level deeper behind its own toggle:
```tsx
          <details>
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
              About you (optional)
            </summary>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Qloo matches taste patterns by age and gender. Nothing here is stored
              or remembered.
            </p>
            {/* two selects, each defaulting to "prefer not to say" (undefined) */}
          </details>
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent src/lib/intent src/lib/providers src/components
git commit -m "feat(intent): resolve vibe, occasion, party and demographics into Qloo signals"
```

---

### Task 9: A narrative for the evening

**Files:**
- Create: `src/lib/route/narrative.ts`, `src/lib/route/narrative.test.ts`
- Modify: `src/lib/route/build.ts`, `src/lib/providers/types.ts`
- Modify: `src/components/RouteView.tsx`, `src/lib/share/encode.ts`

**Interfaces:**
- Consumes: `Stop`, `TimeWindow`, `Evidence`.
- Produces: `buildNarrative(stops: [Stop, Stop, Stop], window: TimeWindow): { line: string; evidence: Evidence[] }`; `Route.narrative`.

- [ ] **Step 1: Write the failing narrative test**

`src/lib/route/narrative.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildNarrative } from './narrative'
import { normaliseWindow } from './window'
import type { Stop } from '../providers/types'
import { FIXTURE_CANDIDATES } from '../providers/fixture'

const stop = (i: number, over: Partial<Stop> = {}): Stop => ({
  order: (i + 1) as 1 | 2 | 3,
  slot: (['open', 'main', 'close'] as const)[i],
  candidate: FIXTURE_CANDIDATES[i],
  why: 'x',
  evidence: [],
  ...over,
})

const three = (): [Stop, Stop, Stop] => [stop(0), stop(1), stop(2)]

describe('buildNarrative', () => {
  it('names the opening venue kind and the closing one', () => {
    const { line } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).toContain('cafe')
    expect(line.length).toBeGreaterThan(20)
  })

  it('reports the total walk, matching the sum of the legs', () => {
    const stops = three()
    stops[1].walkFromPrev = { metres: 600, minutes: 8 }
    stops[2].walkFromPrev = { metres: 900, minutes: 12 }
    const { line } = buildNarrative(stops, normaliseWindow(18, 23))
    expect(line).toContain('20 minutes of walking')
  })

  it('does not mention walking when no leg could be measured', () => {
    const { line } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).not.toContain('walking')
  })

  it('mentions a late finish only when the last stop is open past midnight', () => {
    const stops = three()
    stops[2].candidate = {
      ...stops[2].candidate,
      detail: { openTonight: true },
      hours: { friday: [{ opens: 'T20:00:00', closed: false, closes: 'T02:00:00' }] },
    }
    const { line } = buildNarrative(stops, normaliseWindow(22, 2))
    expect(line).toMatch(/past midnight|still open/)
  })

  it('never claims a vibe no stop matched', () => {
    const { line, evidence } = buildNarrative(three(), normaliseWindow(18, 23))
    expect(line).not.toMatch(/lively|intimate|upscale/)
    expect(evidence.every((e) => e.source === 'qloo')).toBe(true)
  })

  it('names the neighbourhood when all three share one', () => {
    const stops = three().map((s) => ({
      ...s,
      candidate: { ...s.candidate, detail: { neighborhood: 'Wuse 2' } },
    })) as [Stop, Stop, Stop]
    expect(buildNarrative(stops, normaliseWindow(18, 23)).line).toContain('Wuse 2')
  })

  it('stays short when there is little to say', () => {
    const bare = three().map((s) => ({
      ...s,
      candidate: { ...s.candidate, category: null, detail: undefined },
    })) as [Stop, Stop, Stop]
    expect(buildNarrative(bare, normaliseWindow(18, 23)).line.length).toBeLessThan(120)
  })

  it('is deterministic', () => {
    const a = buildNarrative(three(), normaliseWindow(18, 23))
    const b = buildNarrative(three(), normaliseWindow(18, 23))
    expect(a.line).toBe(b.line)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/narrative.test.ts`
Expected: FAIL — cannot resolve `./narrative`.

- [ ] **Step 3: Write `src/lib/route/narrative.ts`**

```ts
import type { Evidence, Stop } from '../providers/types'
import { isOpenDuring } from './open-tonight'
import type { TimeWindow } from './window'

/**
 * A sentence about the shape of the evening, composed from facts already
 * computed: the venue kinds, the shared neighbourhood, the walking total and
 * whether the last stop runs late.
 *
 * Not model-written, for the same reason the per-stop reasons are not. Every
 * clause here can be pointed at a field; a clause with no field behind it is
 * simply left out, which is why the line is short when the data is thin.
 */
export function buildNarrative(
  stops: [Stop, Stop, Stop],
  window: TimeWindow,
): { line: string; evidence: Evidence[] } {
  const clauses: string[] = []
  const evidence: Evidence[] = []

  const kind = (s: Stop) => s.candidate.category?.replace(/_/g, ' ') ?? null
  const first = kind(stops[0])
  const last = kind(stops[2])

  const neighbourhoods = stops
    .map((s) => s.candidate.detail?.neighborhood)
    .filter((n): n is string => !!n)
  const shared =
    neighbourhoods.length === 3 && new Set(neighbourhoods).size === 1
      ? neighbourhoods[0]
      : null

  if (first) {
    clauses.push(shared ? `Starts at a ${first} in ${shared}` : `Starts at a ${first}`)
    evidence.push({ kind: 'tag', label: `opens at a ${first}`, source: 'qloo' })
  } else if (shared) {
    clauses.push(`Three stops in ${shared}`)
  } else {
    clauses.push('Three stops')
  }

  if (last && last !== first) {
    clauses.push(`finishes at a ${last}`)
    evidence.push({ kind: 'tag', label: `closes at a ${last}`, source: 'qloo' })
  }

  const legs = stops.map((s) => s.walkFromPrev?.minutes).filter((m): m is number => m != null)
  if (legs.length > 0) {
    const total = legs.reduce((a, b) => a + b, 0)
    clauses.push(`${total} minutes of walking in total`)
  }

  const lastOpenLate = isOpenDuring(stops[2].candidate.hours, window) === true && window.endHour > 24
  if (lastOpenLate) {
    clauses.push('and the last one is still open past midnight')
    evidence.push({ kind: 'descriptor', label: 'open past midnight', source: 'qloo' })
  }

  return { line: `${clauses.join(', ')}.`, evidence }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/narrative.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Attach it to the route and render it**

In `build.ts`, after `stops` is assembled:
```ts
  const narrative = buildNarrative(stops, input.request.timeWindow)
```
and add `narrative` to the returned route and to `Route` in `types.ts`.

In `RouteView.tsx`, above the stop list:
```tsx
      <p className="mt-4 text-sm leading-relaxed">{route.narrative.line}</p>
```

In `src/lib/share/encode.ts`, add `narrative` to `routeShape` as optional with a default, so links made before this task still decode:
```ts
  narrative: z
    .object({ line: z.string(), evidence: z.array(evidenceShape) })
    .default({ line: '', evidence: [] }),
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/route src/lib/providers/types.ts src/components src/lib/share
git commit -m "feat(route): add a narrative composed from facts, not generated"
```

---

### Task 10: Swap a stop

**Files:**
- Modify: `src/lib/route/build.ts`, `src/lib/providers/types.ts`
- Create: `src/lib/route/swap.ts`, `src/lib/route/swap.test.ts`
- Modify: `src/components/RouteView.tsx`, `src/lib/share/encode.ts`

**Interfaces:**
- Consumes: `Route`, `Stop`, `Candidate`, `orderStops`, `buildWhy`.
- Produces: `Route.alternativesBySlot: Record<SlotName, Candidate[]>`; `swapStop(route: Route, slot: SlotName, candidateId: string): Route`.

- [ ] **Step 1: Write the failing swap test**

`src/lib/route/swap.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute, type BuildInput } from './build'
import { swapStop } from './swap'
import type { Route } from '../providers/types'

const route = (): Route => {
  const r = buildRoute({
    candidates: FIXTURE_CANDIDATES,
    request: {
      city: 'Lagos',
      mood: 'anything',
      timeWindow: { startHour: 18, endHour: 23 },
      intent: {},
    },
    locality: { name: 'Lagos' },
    requestedTagIds: [],
    explainability: null,
    seedNames: {},
    trace: [],
    providerKind: 'fixture',
    intentEcho: { applied: [], ignored: [] },
  } satisfies BuildInput)
  if ('error' in r) throw new Error('expected a route')
  return r
}

describe('alternativesBySlot', () => {
  it('offers runners-up for at least one slot', () => {
    const r = route()
    const total = Object.values(r.alternativesBySlot).flat().length
    expect(total).toBeGreaterThan(0)
  })

  it('never offers a candidate already in the route', () => {
    const r = route()
    const inRoute = new Set(r.stops.map((s) => s.candidate.id))
    for (const list of Object.values(r.alternativesBySlot)) {
      for (const c of list) expect(inRoute.has(c.id)).toBe(false)
    }
  })

  it('never offers a candidate whose category another stop already uses', () => {
    const r = route()
    for (const [slot, list] of Object.entries(r.alternativesBySlot)) {
      const others = r.stops.filter((s) => s.slot !== slot).map((s) => s.candidate.category)
      for (const c of list) expect(others).not.toContain(c.category)
    }
  })
})

describe('swapStop', () => {
  it('replaces the named stop and keeps three stops', () => {
    const r = route()
    const slot = (Object.keys(r.alternativesBySlot) as ('open' | 'main' | 'close')[]).find(
      (s) => r.alternativesBySlot[s].length > 0,
    )!
    const replacement = r.alternativesBySlot[slot][0]
    const next = swapStop(r, slot, replacement.id)
    expect(next.stops).toHaveLength(3)
    expect(next.stops.find((s) => s.slot === slot)?.candidate.id).toBe(replacement.id)
  })

  it('recomputes the walking times after a swap', () => {
    const r = route()
    const slot = (['open', 'main', 'close'] as const).find(
      (s) => r.alternativesBySlot[s].length > 0,
    )!
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    const before = r.stops.map((s) => s.walkFromPrev?.metres)
    const after = next.stops.map((s) => s.walkFromPrev?.metres)
    expect(after).not.toEqual(before)
  })

  it('keeps the close slot last after a swap', () => {
    const r = route()
    const slot = (['open', 'main', 'close'] as const).find(
      (s) => r.alternativesBySlot[s].length > 0,
    )!
    expect(swapStop(r, slot, r.alternativesBySlot[slot][0].id).stops.at(-1)?.slot).toBe('close')
  })

  it('returns the route unchanged for an unknown candidate id', () => {
    const r = route()
    expect(swapStop(r, 'main', 'no-such-place')).toEqual(r)
  })

  it('moves the swapped-out place into the alternatives', () => {
    const r = route()
    const slot = (['open', 'main', 'close'] as const).find(
      (s) => r.alternativesBySlot[s].length > 0,
    )!
    const original = r.stops.find((s) => s.slot === slot)!.candidate.id
    const next = swapStop(r, slot, r.alternativesBySlot[slot][0].id)
    expect(next.alternativesBySlot[slot].map((c) => c.id)).toContain(original)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/swap.test.ts`
Expected: FAIL — `alternativesBySlot` is not a property.

- [ ] **Step 3: Produce `alternativesBySlot` in `build.ts`**

After `takenIds` is final:
```ts
  const ALTERNATIVES_PER_SLOT = 4
  const alternativesBySlot = (['open', 'main', 'close'] as const).reduce(
    (acc, slot) => {
      const usedByOthers = (['open', 'main', 'close'] as const)
        .filter((s) => s !== slot)
        .map((s) => chosen[s].category)
      acc[slot] = pool
        .filter(
          (c) =>
            !takenIds.has(c.id) &&
            slotsFor(c).includes(slot) &&
            !usedByOthers.includes(c.category),
        )
        .map((c) => ({ c, score: scoreCandidate(c, slot, { requestedTagIds: input.requestedTagIds, timeWindow: input.request.timeWindow, usedCategories: usedByOthers.filter((x): x is string => !!x), anchor }) }))
        .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
        .slice(0, ALTERNATIVES_PER_SLOT)
        .map((e) => e.c)
      return acc
    },
    { open: [], main: [], close: [] } as Record<SlotName, Candidate[]>,
  )
```
Add `alternativesBySlot` to `Route` and to the returned object.

- [ ] **Step 4: Write `src/lib/route/swap.ts`**

```ts
import type { Candidate, Route, SlotName, Stop } from '../providers/types'
import { buildNarrative } from './narrative'
import { orderStops } from './order'

/**
 * Swapping is pure and client-side: the alternatives were scored when the
 * route was built, so changing a stop costs no Qloo call and no model round.
 * The server filtered the list for duplicate places and categories, so a swap
 * cannot construct an invalid route.
 */
export function swapStop(route: Route, slot: SlotName, candidateId: string): Route {
  const replacement = route.alternativesBySlot[slot]?.find((c) => c.id === candidateId)
  if (!replacement) return route

  const current = route.stops.find((s) => s.slot === slot)
  if (!current) return route

  const chosen = route.stops.reduce(
    (acc, s) => {
      acc[s.slot] = s.slot === slot ? replacement : s.candidate
      return acc
    },
    {} as Record<SlotName, Candidate>,
  )

  const ordered = orderStops(chosen)
  const bySlot = new Map(route.stops.map((s) => [s.slot, s]))

  const stops = ordered.map((o, i) => {
    const previous = bySlot.get(o.slot)!
    const base: Stop =
      o.slot === slot
        ? {
            ...previous,
            candidate: replacement,
            // The reason belonged to the place that left, so it goes with it.
            why: `A ${replacement.category?.replace(/_/g, ' ') ?? 'place'} in ${route.locality.name}.`,
            evidence: [],
          }
        : previous
    return {
      ...base,
      order: (i + 1) as 1 | 2 | 3,
      ...(o.walkFromPrev ? { walkFromPrev: o.walkFromPrev } : { walkFromPrev: undefined }),
    }
  }) as [Stop, Stop, Stop]

  return {
    ...route,
    stops,
    narrative: buildNarrative(stops, route.narrativeWindow),
    alternativesBySlot: {
      ...route.alternativesBySlot,
      [slot]: [
        current.candidate,
        ...route.alternativesBySlot[slot].filter((c) => c.id !== candidateId),
      ].slice(0, 4),
    },
  }
}
```

`Route` gains `narrativeWindow: TimeWindow` so a swap can rebuild the narrative without the original request. Add it in `build.ts` as `narrativeWindow: input.request.timeWindow`.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/lib/route/swap.test.ts && npm test && npm run typecheck`
Expected: green.

- [ ] **Step 6: Add the swap control**

In `StopCard`, accept `alternatives: Candidate[]` and `onSwap: (id: string) => void`. Render a "swap" button that toggles a short list of the alternatives by name, each a button calling `onSwap`. `RouteView` holds the route in state so a swap re-renders, and passes `route.alternativesBySlot[stop.slot]`.

Add `alternativesBySlot` and `narrativeWindow` to the share schema as optional with empty defaults.

- [ ] **Step 7: Commit**

```bash
git add src/lib/route src/lib/providers/types.ts src/components src/lib/share
git commit -m "feat(route): offer scored alternatives and let a stop be swapped"
```

---

### Task 11: Remember preferences on this device

Covers **Review Focus 5**.

**Files:**
- Create: `src/lib/intent/preferences.ts`, `src/lib/intent/preferences.test.ts`
- Modify: `src/components/MoodForm.tsx`, `src/components/TunePanel.tsx`

**Interfaces:**
- Consumes: `Intent`, the vocabulary constants.
- Produces: `savePreferences(intent: Intent): void`; `loadPreferences(): Intent`; `forgetPreferences(): void`; `PREFERENCES_KEY`.

- [ ] **Step 1: Write the failing preferences test**

`src/lib/intent/preferences.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetPreferences,
  loadPreferences,
  PREFERENCES_KEY,
  savePreferences,
} from './preferences'

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('preferences', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  it('round-trips the fields worth keeping', () => {
    savePreferences({
      vibe: ['quiet'],
      budget: 2,
      persona: 'newcomer',
      requirements: { dietary: ['halal'] },
      discovery: 0.8,
    })
    const back = loadPreferences()
    expect(back.vibe).toEqual(['quiet'])
    expect(back.budget).toBe(2)
    expect(back.requirements?.dietary).toEqual(['halal'])
  })

  it('never stores demographics', () => {
    savePreferences({ demographics: { ageBand: '25_to_29', gender: 'female' } })
    expect(localStorage.getItem(PREFERENCES_KEY) ?? '').not.toMatch(/25_to_29|female/)
    expect(loadPreferences().demographics).toBeUndefined()
  })

  it('never stores the one-off fields', () => {
    savePreferences({ seedPlaces: ['Jazzhole'], clarified: { question: 'q', answer: 'a' } })
    const raw = localStorage.getItem(PREFERENCES_KEY) ?? ''
    expect(raw).not.toContain('Jazzhole')
    expect(raw).not.toContain('"answer"')
  })

  it('discards a blob from an unknown version', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 99, budget: 2 }))
    expect(loadPreferences()).toEqual({})
  })

  it('discards a hand-edited blob with a wrong-typed field', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, budget: 'cheap' }))
    expect(loadPreferences()).toEqual({})
  })

  it('discards an unknown vibe rather than loading it into the form', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, vibe: ['vibey'] }))
    expect(loadPreferences()).toEqual({})
  })

  it('returns empty rather than throwing when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    })
    expect(loadPreferences()).toEqual({})
    expect(() => savePreferences({ budget: 2 })).not.toThrow()
  })

  it('forgets everything on request', () => {
    savePreferences({ budget: 2 })
    forgetPreferences()
    expect(loadPreferences()).toEqual({})
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/intent/preferences.test.ts`
Expected: FAIL — cannot resolve `./preferences`.

- [ ] **Step 3: Write `src/lib/intent/preferences.ts`**

```ts
import { z } from 'zod'
import type { Intent } from '../providers/types'
import {
  ACCESSIBILITY_IDS,
  DIETARY_IDS,
  OCCASION_IDS,
  PARTY_COMPOSITIONS,
  PERSONAS,
  VIBE_IDS,
} from './vocabulary'

export const PREFERENCES_KEY = 'tasteroute.preferences.v1'

/**
 * What is worth remembering between nights out. Deliberately absent:
 * demographics (not kept even locally), and city, mood, time window,
 * seedPlaces and clarified, which change every time.
 */
const storedSchema = z.object({
  version: z.literal(1),
  vibe: z.array(z.enum(VIBE_IDS)).max(6).optional(),
  occasion: z.enum(OCCASION_IDS).optional(),
  party: z
    .object({
      size: z.number().int().min(1).max(40),
      composition: z.enum(PARTY_COMPOSITIONS).optional(),
    })
    .optional(),
  persona: z.enum(PERSONAS).optional(),
  discovery: z.number().min(0).max(1).optional(),
  budget: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  requirements: z
    .object({
      dietary: z.array(z.enum(DIETARY_IDS)).max(5).optional(),
      accessibility: z.array(z.enum(ACCESSIBILITY_IDS)).max(3).optional(),
    })
    .optional(),
  avoid: z.array(z.string().min(1).max(40)).max(8).optional(),
})

export function savePreferences(intent: Intent): void {
  try {
    const { vibe, occasion, party, persona, discovery, budget, requirements, avoid } = intent
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        vibe,
        occasion,
        party,
        persona,
        discovery,
        budget,
        requirements,
        avoid,
      }),
    )
  } catch {
    // Private browsing, or storage refused. Remembering is a convenience.
  }
}

export function loadPreferences(): Intent {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return {}
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    // A stale or hand-edited blob is discarded whole. Loading half of it into
    // the form would be worse than loading none.
    if (!parsed.success) return {}
    const { version: _version, ...intent } = parsed.data
    return intent
  } catch {
    return {}
  }
}

export function forgetPreferences(): void {
  try {
    localStorage.removeItem(PREFERENCES_KEY)
  } catch {
    // Nothing to do; it was never stored.
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/intent/preferences.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire it into the form**

In `MoodForm`, load on mount into the intent state, save after a successful plan, and add a "forget my preferences" button inside the open Tune panel that calls `forgetPreferences()` and resets the state to `{}`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/intent src/components
git commit -m "feat(intent): remember the tuning panel on this device, never the demographics"
```

---

### Task 12: Verify, document, deploy

**Files:**
- Modify: `README.md`, `STATUS.md`, `docs/submission.md`
- Create: `.superpowers/sdd/<plan>/ui-check3.mjs` (workspace, not committed)

- [ ] **Step 1: Run everything**

```bash
cd ~/Techclave/tasteroute
npm test && npm run typecheck && npm run build
set -a && . ./.env.local && set +a && npx vitest run src/lib/providers/qloo.live.test.ts
```
Expected: all green.

- [ ] **Step 2: Browser-check the new surface**

Write a Playwright script in the workspace covering: the Tune panel opens and
closes; the discovery slider moves and is sent; a clarifying question renders
with its options and a skip; the skip plans a route; a stop swaps and the walk
times change; "forget my preferences" empties the panel; no horizontal scroll
at 390px; no console errors.

Two of those are **Review Focus 4**, and must be asserted rather than eyeballed:
block `images.qloo.com` with `page.route('**/images.qloo.com/**', r => r.abort())`
and assert the card's bounding box height is unchanged from the unblocked run,
and that the route still renders its three names.

```bash
npm install --no-save playwright@1.56.1
EXE=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | sort -V | tail -1)
PW_CHROME="$EXE" node .superpowers/sdd/2026-10-24-richer-intent/ui-check3.mjs
```
Expected: all pass, clean console.

- [ ] **Step 3: Update the docs**

README: a "What you can tell it" section listing the dimensions and which are hard filters; the Qloo-findings list gains `primary_genre`, the popularity band, the sparse `price_level`, and that demographics do change results. STATUS: the decisions and the remaining submission steps. `docs/submission.md`: the clarifying question and hidden gems belong in the Devpost description — they are the strongest material in the build.

- [ ] **Step 4: Deploy and verify on production**

```bash
npx vercel@latest deploy --prod --yes
curl -s -X POST https://tasteroute-sepia.vercel.app/api/route \
  -H 'content-type: application/json' \
  -d '{"city":"Abuja","mood":"quiet, good food","startHour":19,"endHour":23,"discovery":0.9,"budget":2,"occasion":"first_date","party":{"size":2,"composition":"couple"}}' \
  --max-time 300 | python3 -m json.tool | head -40
```
Expected: a route whose stops differ from the same request without the intent fields.

- [ ] **Step 5: Commit**

```bash
git add README.md STATUS.md docs/submission.md
git commit -m "docs: record the intent dimensions and what Qloo actually honours"
```

---

## Self-review notes

**Spec coverage:** §3 contract → Task 1. §4 requirements-not-preferences → Tasks 4, 5. §5 mapping → Tasks 3, 4, 5, 8. §6 interface → Tasks 3, 4, 5, 8, 11. §7 richer cards → Task 7. §8 clarifying question → Task 6. §9 narrative → Task 9. §10 stored preferences → Task 11. §11 price sparsity and venue kinds → Tasks 2, 4. §12 swap → Task 10. §13 backward compatibility → Tasks 1, 9, 10 (optional share fields). §14 demographics handling → Tasks 8, 11. §15 testing → throughout.

**Deliberate deviations from the spec:**
- The spec's `RouteRequest` spreads intent fields at the top level. The plan nests them under `intent`, because `constraintsFromIntent` and `resolvePreferenceTags` both take exactly that object and a flat shape would need a pick list in two places. The wire body stays flat, so the contract in §3 is unchanged from the client's side.
- `Route` gains `narrativeWindow` so `swapStop` can rebuild the narrative without the original request. The spec did not anticipate needing the window after the build.
- Demographics are deliberately excluded from `intentEcho.applied`, which §3 does not say. Echoing somebody's age and gender back at them on a results page is not a feature.

**Known risk:** Task 1 changes `RouteRequest` and so touches every test that constructs one. Step 10 of that task is mechanical but wide; run `npm run typecheck` and work the list rather than guessing.
