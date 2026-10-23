# TasteRoute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hosted web app where a mood plus a city produces a three-stop outing route, planned by an agent calling Qloo's taste graph, with every stop's reason traceable to a Qloo field.

**Architecture:** A Next.js app with all Qloo and model calls server-side. An agent loop decides which Qloo queries to run (which tags, when to widen, when to stop); a set of pure functions decides scores, stop order and reason text. Qloo sits behind a `TasteProvider` interface with a hand-written fixture implementation so the whole engine is testable without network.

**Tech Stack:** Next.js 16.4.2, React 19.3.1, TypeScript 7.0.2, Tailwind CSS 4.3.3, Zod 4.6.7, Vitest 5.0.5, `openai` 7.32.0 pointed at OpenRouter, deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-10-23-tasteroute-design.md`

## Global Constraints

- Submission deadline **30 October 2026, 11:45pm EDT**. Slice 0 deploys today.
- Qloo base URL is **`https://hackathon.api.qloo.com`**. Auth header is **`X-Api-Key`** — never a query parameter, never a Bearer token.
- Allowed Qloo endpoints: **`/search`, `/v2/insights`, `/v2/tags`** only. `/recs` and `/recommendations` return 403.
- Qloo **silently ignores invalid parameters** and returns 200. Every outbound parameter name must pass an allowlist in our code before the request is built.
- `feature.explainability=true` only computes for **`signal.interests.entities`**. With `signal.interests.tags` it returns `warnings: [{type: "Could not calculate explainability"}]` and no explainability block.
- `take` is capped at **50** by Qloo.
- Supported `filter.type` values: artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game. Others return 403.
- Model is **`openai/gpt-5-mini`** via OpenRouter (`OPENAI_BASE_URL=https://openrouter.ai/api/v1`). Credit remaining is **$4.79** — the agent is capped at **6 tool rounds per route**.
- No API key may reach the browser, be logged, or be committed. `.env.local` is `chmod 600` and gitignored.
- **No Qloo response data in the repo.** Fixtures are hand-written to mirror the observed schema, never captured responses. `qloo-cache/` and `*.qloo.json` are gitignored.
- Nothing from the UrbanEx deck (Belsoft Systems, privileged and confidential) appears in the repo: no text, branding, feature names, or the UrbanEx name.
- A route built from fixtures must always render a visible fixture banner. Never present fixture data as live Qloo data.
- Exactly three stops, or no route.
- MIT licence file at repo root, visible in the GitHub About section.

## Review Focus

1. **Unknown city name** — Qloo returns 400 for `filter.location.query` with no locality match. The user should see "we don't have data for that city", not a stack trace or an empty route. *(Task 10)*
2. **One place eligible for two slots** — a cocktail bar tagged both `main` and `close` must not appear as two stops in the same route. *(Task 9)*
3. **Candidate with null `geocode`** — Qloo places can lack coordinates. Distance maths must not produce `NaN` and must not silently rank such a candidate first. *(Task 6)*
4. **Fewer than three fillable slots** — after `is_closed` and time-window penalties there may be no candidate for a slot. The app must say which slot it could not fill rather than return a short route typed as three stops. *(Task 9)*
5. **Tampered or truncated share URL** — a hand-edited `?r=` parameter must fail to a clean "this link is not readable" state, never an unhandled throw that blanks the page. *(Task 15)*

---

### Task 1: Repo skeleton, hosted and public

Deployment is pass/fail for the submission, so it happens before any logic exists.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `LICENSE`, `README.md`, `STATUS.md`, `.env.example`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test`, `npm run build`, and a public Vercel URL recorded in `STATUS.md`.

- [ ] **Step 1: Create `package.json` with exact pins**

```json
{
  "name": "tasteroute",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "16.4.2",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "openai": "7.32.0",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.10.1",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "tailwindcss": "4.3.3",
    "typescript": "7.0.2",
    "vitest": "5.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`**

`next.config.ts`:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
```

`postcss.config.mjs`:
```js
export default {
  plugins: ['@tailwindcss/postcss'],
}
```

`vitest.config.ts` — node environment, because every test in this plan tests pure logic:
```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 4: Create the app shell**

`src/app/globals.css`:
```css
@import "tailwindcss";

:root {
  --bg: #0a0a0a;
  --fg: #fafafa;
  --accent: #00ff88;
  --muted: #a1a1aa;
  --card: #141414;
  --border: #262626;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TasteRoute',
  description: 'A mood and a city become a three-stop outing, with reasons you can check.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
```

`src/app/page.tsx` — deliberately minimal; Task 14 replaces it:
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">TasteRoute</h1>
      <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
        A mood and a city become a three-stop outing, with reasons you can check.
      </p>
      <p className="mt-8 text-xs" style={{ color: 'var(--muted)' }}>
        Built by TechClave. Powered by Qloo&apos;s Taste AI.
      </p>
    </main>
  )
}
```

- [ ] **Step 5: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 TechClave

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Create `.env.example`** (names only, no values)

```
# Qloo Agentic Hackathon API
QLOO_API_BASE_URL=https://hackathon.api.qloo.com
QLOO_API_KEY=

# Model access. Point OPENAI_BASE_URL at OpenRouter, or remove it to use OpenAI directly.
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
TASTEROUTE_MODEL=openai/gpt-5-mini
```

- [ ] **Step 7: Write a smoke test so `npm test` is green from the start**

`src/lib/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs typescript tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8: Install and verify**

```bash
cd ~/Techclave/tasteroute
npm install
npm test
npm run typecheck
npm run build
```
Expected: tests pass, typecheck clean, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts LICENSE .env.example src
git commit -m "chore: scaffold Next.js app with MIT licence and test harness"
```

- [ ] **Step 10: Deploy to Vercel and record the URL**

```bash
npx --yes vercel@latest deploy --prod --yes
```
Add `QLOO_API_BASE_URL`, `QLOO_API_KEY`, `OPENAI_BASE_URL`, `OPENROUTER_API_KEY` and `TASTEROUTE_MODEL` as Vercel environment variables through the dashboard or `vercel env add`. Never paste a key into a committed file.

Write the resulting public URL into `STATUS.md` under a `## Hosted demo` heading, then commit `STATUS.md`.

Expected: the URL loads the heading over a dark background from a phone.

---

### Task 2: Provider types, Zod schemas, and the parameter allowlist

**Files:**
- Create: `src/lib/providers/types.ts`
- Create: `src/lib/providers/schemas.ts`
- Create: `src/lib/providers/params.ts`
- Test: `src/lib/providers/params.test.ts`, `src/lib/providers/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TasteProvider`, `Candidate`, `Tag`, `EntityRef`, `PlaceQuery`, `PlaceResult`, `ProviderExplainability`, `Evidence`, `EvidenceKind`, `Stop`, `Confidence`, `Route`, `TraceEntry`, `Locality`, `RouteRequest`, `SlotName`; `buildInsightsParams(input: Record<string, string | number | boolean | undefined>): URLSearchParams`; `QlooInsightsResponse`, `qlooInsightsSchema`, `qlooTagsSchema`, `qlooSearchSchema`.

- [ ] **Step 1: Write `src/lib/providers/types.ts`**

```ts
export type SlotName = 'open' | 'main' | 'close'

export type RouteRequest = {
  city: string
  mood: string
  timeWindow: { startHour: number; endHour: number }
}

export type Locality = {
  name: string
  qlooLocalityId?: string
  centroid?: { lat: number; lng: number }
}

export type Tag = {
  id: string
  name: string
  type: string
  popularity: number
}

export type EntityRef = {
  entityId: string
  name: string
}

export type PlaceQuery = {
  locality: string
  tags?: { id: string; weight?: number }[]
  entities?: string[]
  take?: number
}

export type Candidate = {
  id: string
  name: string
  category: string | null
  lat: number | null
  lng: number | null
  address: string | null
  affinity: number | null
  popularity: number | null
  isClosed: boolean | null
  hours: unknown | null
  tags: Tag[]
  descriptors: {
    goodFor?: string
    ambience?: string
    cuisine?: string
    cost?: string
    liveMusic?: string
    rating?: number
  }
  providerRank: number
  providerRef: { provider: 'qloo' | 'fixture'; entityId: string }
}

export type ProviderExplainability = {
  signalEntities: { entityId: string; avgScore: number; topN: 3 | 5 | 10 | 'all' }[]
}

export type PlaceResult = {
  candidates: Candidate[]
  explainability: ProviderExplainability | null
  warnings: string[]
}

export interface TasteProvider {
  readonly kind: 'qloo' | 'fixture'
  findTags(query: string): Promise<Tag[]>
  seedEntities(names: string[]): Promise<EntityRef[]>
  suggestPlaces(q: PlaceQuery): Promise<PlaceResult>
}

export type EvidenceKind =
  | 'explainability'
  | 'tag'
  | 'affinity'
  | 'descriptor'
  | 'popularity'

export type Evidence = {
  kind: EvidenceKind
  label: string
  value?: string | number
  source: 'qloo'
}

export type Stop = {
  order: 1 | 2 | 3
  slot: SlotName
  candidate: Candidate
  why: string
  evidence: Evidence[]
  walkFromPrev?: { metres: number; minutes: number }
}

export type Confidence = 'strong' | 'ok' | 'weak'

export type TraceEntry = {
  at: string
  tool: string
  argsSummary: string
  resultSummary: string
  ms: number
}

export type Route = {
  id: string
  locality: Locality
  mood: string
  createdAt: string
  stops: [Stop, Stop, Stop]
  confidence: Confidence
  alternatives: Candidate[]
  trace: TraceEntry[]
  providerKind: 'qloo' | 'fixture'
  unfilledSlots: SlotName[]
}
```

`stops` is a fixed-length tuple so the compiler rejects a short route. `unfilledSlots` carries the Review Focus item 4 case.

- [ ] **Step 2: Write the failing allowlist test**

`src/lib/providers/params.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildInsightsParams } from './params'

describe('buildInsightsParams', () => {
  it('passes through allowed parameters', () => {
    const p = buildInsightsParams({
      'filter.type': 'urn:entity:place',
      'filter.location.query': 'Lagos',
      take: 20,
    })
    expect(p.get('filter.type')).toBe('urn:entity:place')
    expect(p.get('filter.location.query')).toBe('Lagos')
    expect(p.get('take')).toBe('20')
  })

  it('throws on an unknown parameter name, because Qloo would silently ignore it', () => {
    expect(() =>
      buildInsightsParams({ 'filter.locaton.query': 'Lagos' }),
    ).toThrow(/not an allowed Qloo insights parameter/)
  })

  it('omits undefined values rather than sending empty strings', () => {
    const p = buildInsightsParams({ 'filter.type': 'urn:entity:place', take: undefined })
    expect(p.has('take')).toBe(false)
  })

  it('serialises booleans as true/false', () => {
    const p = buildInsightsParams({ 'feature.explainability': true })
    expect(p.get('feature.explainability')).toBe('true')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/providers/params.test.ts`
Expected: FAIL — cannot resolve `./params`.

- [ ] **Step 4: Write `src/lib/providers/params.ts`**

```ts
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
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/lib/providers/params.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing schema test**

`src/lib/providers/schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { qlooInsightsSchema, qlooTagsSchema } from './schemas'

const minimalInsights = {
  success: true,
  results: {
    entities: [
      {
        entity_id: 'D1794390-0F7B-4DF8-8149-E4506D373BAD',
        name: 'NOK by Alara',
        type: 'urn:entity:place',
        properties: { address: '12A Akin Olugbade St' },
        tags: [],
      },
    ],
  },
}

describe('qlooInsightsSchema', () => {
  it('accepts a response with only the fields Qloo always returns', () => {
    const parsed = qlooInsightsSchema.parse(minimalInsights)
    expect(parsed.results.entities[0].name).toBe('NOK by Alara')
  })

  it('accepts a missing entities array as empty', () => {
    const parsed = qlooInsightsSchema.parse({ success: true, results: {} })
    expect(parsed.results.entities).toEqual([])
  })

  it('surfaces warnings when Qloo could not compute explainability', () => {
    const parsed = qlooInsightsSchema.parse({
      ...minimalInsights,
      warnings: [{ type: 'Could not calculate explainability' }],
    })
    expect(parsed.warnings?.[0].type).toContain('explainability')
  })

  it('rejects a payload missing entity_id, which we key on', () => {
    const bad = { success: true, results: { entities: [{ name: 'No id' }] } }
    expect(qlooInsightsSchema.safeParse(bad).success).toBe(false)
  })
})

describe('qlooTagsSchema', () => {
  it('parses a tag with its urn and popularity', () => {
    const parsed = qlooTagsSchema.parse({
      success: true,
      results: {
        tags: [
          {
            id: 'urn:tag:genre:place:restaurant:cocktail_bar',
            name: 'Cocktail Bar',
            type: 'urn:tag:genre:place',
            popularity: 0.99964285,
          },
        ],
      },
    })
    expect(parsed.results.tags[0].id).toContain('cocktail_bar')
  })
})
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npx vitest run src/lib/providers/schemas.test.ts`
Expected: FAIL — cannot resolve `./schemas`.

- [ ] **Step 8: Write `src/lib/providers/schemas.ts`**

Every field Qloo does not guarantee is optional. The schema's job is to catch shape changes in what we rely on, not to mirror the whole API.

```ts
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
```

- [ ] **Step 9: Run it and watch it pass**

Run: `npx vitest run src/lib/providers/schemas.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 10: Commit**

```bash
git add src/lib/providers/types.ts src/lib/providers/params.ts src/lib/providers/schemas.ts src/lib/providers/params.test.ts src/lib/providers/schemas.test.ts
git commit -m "feat(providers): add taste provider contract, Qloo schemas, param allowlist"
```

---

### Task 3: Fixture provider

Hand-written, never captured from Qloo. This is what makes the whole engine testable and what the deployed app falls back to when the model budget is spent.

**Files:**
- Create: `src/lib/providers/fixture.ts`
- Test: `src/lib/providers/fixture.test.ts`

**Interfaces:**
- Consumes: `TasteProvider`, `Candidate`, `Tag`, `EntityRef`, `PlaceQuery`, `PlaceResult` from Task 2.
- Produces: `FixtureProvider` class implementing `TasteProvider` with `kind = 'fixture'`; `FIXTURE_CANDIDATES: Candidate[]`; `FIXTURE_TAGS: Tag[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/providers/fixture.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FixtureProvider } from './fixture'

describe('FixtureProvider', () => {
  const p = new FixtureProvider()

  it('declares itself as a fixture so the UI can disclose it', () => {
    expect(p.kind).toBe('fixture')
  })

  it('finds tags by substring, case-insensitively', async () => {
    const tags = await p.findTags('COCKTAIL')
    expect(tags.length).toBeGreaterThan(0)
    expect(tags[0].id).toContain('cocktail')
  })

  it('returns an empty array for a query matching nothing', async () => {
    expect(await p.findTags('zzzznope')).toEqual([])
  })

  it('returns candidates covering all three slots', async () => {
    const { candidates } = await p.suggestPlaces({ locality: 'Lagos' })
    expect(candidates.length).toBeGreaterThanOrEqual(9)
    expect(candidates.every((c) => c.providerRef.provider === 'fixture')).toBe(true)
  })

  it('assigns sequential providerRank starting at 1', async () => {
    const { candidates } = await p.suggestPlaces({ locality: 'Lagos' })
    expect(candidates.map((c) => c.providerRank).slice(0, 3)).toEqual([1, 2, 3])
  })

  it('filters candidates by requested tags when tags are given', async () => {
    const { candidates } = await p.suggestPlaces({
      locality: 'Lagos',
      tags: [{ id: 'urn:tag:genre:place:restaurant:cocktail_bar' }],
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(
      candidates.every((c) =>
        c.tags.some((t) => t.id === 'urn:tag:genre:place:restaurant:cocktail_bar'),
      ),
    ).toBe(true)
  })

  it('returns null explainability unless entities were seeded', async () => {
    const withTags = await p.suggestPlaces({ locality: 'Lagos' })
    expect(withTags.explainability).toBeNull()

    const seeded = await p.suggestPlaces({ locality: 'Lagos', entities: ['fx-nok'] })
    expect(seeded.explainability?.signalEntities[0].entityId).toBe('fx-nok')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/providers/fixture.test.ts`
Expected: FAIL — cannot resolve `./fixture`.

- [ ] **Step 3: Write `src/lib/providers/fixture.ts`**

Nine Lagos places, three per slot, with plausible invented detail. The coordinates are approximate Lagos Island / Victoria Island / Ikoyi positions so distance maths has something real to chew on.

```ts
import type {
  Candidate,
  EntityRef,
  PlaceQuery,
  PlaceResult,
  Tag,
  TasteProvider,
} from './types'

const T = (id: string, name: string, type: string, popularity = 0.9): Tag => ({
  id,
  name,
  type,
  popularity,
})

export const FIXTURE_TAGS: Tag[] = [
  T('urn:tag:genre:place:restaurant:cocktail_bar', 'Cocktail Bar', 'urn:tag:genre:place', 0.99),
  T('urn:tag:offerings:place:cocktails', 'Cocktails', 'urn:tag:offerings:place', 0.99),
  T('urn:tag:offerings:place:live_music', 'Live Music', 'urn:tag:offerings:place', 0.95),
  T('urn:tag:genre:place:cafe', 'Cafe', 'urn:tag:genre:place', 0.97),
  T('urn:tag:genre:place:bakery', 'Bakery', 'urn:tag:genre:place', 0.9),
  T('urn:tag:genre:place:restaurant', 'Restaurant', 'urn:tag:genre:place', 0.99),
  T('urn:tag:genre:place:restaurant:nigerian', 'Nigerian Restaurant', 'urn:tag:genre:place', 0.93),
  T('urn:tag:genre:place:gallery', 'Art Gallery', 'urn:tag:genre:place', 0.84),
  T('urn:tag:genre:place:bar:lounge', 'Lounge', 'urn:tag:genre:place', 0.92),
  T('urn:tag:offerings:place:dessert', 'Dessert', 'urn:tag:offerings:place', 0.88),
]

const tag = (id: string): Tag => {
  const found = FIXTURE_TAGS.find((t) => t.id === id)
  if (!found) throw new Error(`fixture tag not defined: ${id}`)
  return found
}

type Seed = {
  id: string
  name: string
  category: string
  lat: number
  lng: number
  address: string
  affinity: number
  popularity: number
  tagIds: string[]
  descriptors: Candidate['descriptors']
}

const SEEDS: Seed[] = [
  {
    id: 'fx-cafe-neo',
    name: 'Cafe Nine',
    category: 'cafe',
    lat: 6.4281,
    lng: 3.4219,
    address: '9 Kofo Abayomi St, Victoria Island',
    affinity: 0.81,
    popularity: 0.72,
    tagIds: ['urn:tag:genre:place:cafe'],
    descriptors: { goodFor: 'working, quiet mornings', ambience: 'calm, bright', cost: 'moderate', rating: 4.4 },
  },
  {
    id: 'fx-bakery-rise',
    name: 'Rise Bakehouse',
    category: 'bakery',
    lat: 6.4386,
    lng: 3.4312,
    address: '3 Musa Yar’Adua St, Victoria Island',
    affinity: 0.69,
    popularity: 0.64,
    tagIds: ['urn:tag:genre:place:bakery', 'urn:tag:offerings:place:dessert'],
    descriptors: { goodFor: 'pastries, a short stop', ambience: 'casual', cost: 'cheap', rating: 4.2 },
  },
  {
    id: 'fx-gallery-ember',
    name: 'Ember Gallery',
    category: 'gallery',
    lat: 6.4502,
    lng: 3.4386,
    address: '14 Awolowo Rd, Ikoyi',
    affinity: 0.74,
    popularity: 0.51,
    tagIds: ['urn:tag:genre:place:gallery'],
    descriptors: { goodFor: 'a slow look around', ambience: 'quiet, airy', cost: 'free', rating: 4.6 },
  },
  {
    id: 'fx-nok',
    name: 'Terrace Nine Kitchen',
    category: 'restaurant',
    lat: 6.4304,
    lng: 3.4265,
    address: '12A Akin Olugbade St, Victoria Island',
    affinity: 0.88,
    popularity: 0.83,
    tagIds: ['urn:tag:genre:place:restaurant', 'urn:tag:genre:place:restaurant:nigerian'],
    descriptors: { goodFor: 'dinner with friends', ambience: 'chic, outdoor seating', cuisine: 'West African', cost: 'expensive', rating: 4.5 },
  },
  {
    id: 'fx-yellow-chair',
    name: 'The Yellow Chair',
    category: 'restaurant',
    lat: 6.4335,
    lng: 3.4288,
    address: '2 Idowu Martins St, Victoria Island',
    affinity: 0.76,
    popularity: 0.7,
    tagIds: ['urn:tag:genre:place:restaurant'],
    descriptors: { goodFor: 'a long table', ambience: 'loud, lively', cuisine: 'small plates', cost: 'moderate', rating: 4.1 },
  },
  {
    id: 'fx-closed-kitchen',
    name: 'Harbour Grill',
    category: 'restaurant',
    lat: 6.4412,
    lng: 3.4201,
    address: '7 Ozumba Mbadiwe Ave, Victoria Island',
    affinity: 0.91,
    popularity: 0.88,
    tagIds: ['urn:tag:genre:place:restaurant'],
    descriptors: { goodFor: 'dinner', ambience: 'formal', cost: 'expensive', rating: 4.7 },
  },
  {
    id: 'fx-bar-slate',
    name: 'Slate & Smoke',
    category: 'cocktail_bar',
    lat: 6.4319,
    lng: 3.4301,
    address: '21 Adeola Odeku St, Victoria Island',
    affinity: 0.86,
    popularity: 0.79,
    tagIds: [
      'urn:tag:genre:place:restaurant:cocktail_bar',
      'urn:tag:offerings:place:cocktails',
    ],
    descriptors: { goodFor: 'a late drink', ambience: 'dark, low-lit', cost: 'expensive', rating: 4.4 },
  },
  {
    id: 'fx-lounge-brass',
    name: 'Brass Room',
    category: 'lounge',
    lat: 6.4357,
    lng: 3.4334,
    address: '5 Saka Tinubu St, Victoria Island',
    affinity: 0.72,
    popularity: 0.66,
    tagIds: ['urn:tag:genre:place:bar:lounge', 'urn:tag:offerings:place:live_music'],
    descriptors: { goodFor: 'live sets', ambience: 'warm, busy', liveMusic: 'Thursday to Sunday', cost: 'moderate', rating: 4.3 },
  },
  {
    id: 'fx-bar-afterglow',
    name: 'Afterglow',
    category: 'cocktail_bar',
    lat: 6.4478,
    lng: 3.4412,
    address: '18 Bourdillon Rd, Ikoyi',
    affinity: 0.64,
    popularity: 0.58,
    tagIds: [
      'urn:tag:genre:place:restaurant:cocktail_bar',
      'urn:tag:offerings:place:live_music',
    ],
    descriptors: { goodFor: 'a quiet nightcap', ambience: 'intimate', cost: 'moderate', rating: 4.0 },
  },
]

export const FIXTURE_CANDIDATES: Candidate[] = SEEDS.map((s, i) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  lat: s.lat,
  lng: s.lng,
  address: s.address,
  affinity: s.affinity,
  popularity: s.popularity,
  isClosed: s.id === 'fx-closed-kitchen' ? true : false,
  hours: null,
  tags: s.tagIds.map(tag),
  descriptors: s.descriptors,
  providerRank: i + 1,
  providerRef: { provider: 'fixture', entityId: s.id },
}))

export class FixtureProvider implements TasteProvider {
  readonly kind = 'fixture' as const

  async findTags(query: string): Promise<Tag[]> {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return FIXTURE_TAGS.filter(
      (t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    )
  }

  async seedEntities(names: string[]): Promise<EntityRef[]> {
    const wanted = names.map((n) => n.toLowerCase().trim()).filter(Boolean)
    return FIXTURE_CANDIDATES.filter((c) =>
      wanted.some((w) => c.name.toLowerCase().includes(w)),
    ).map((c) => ({ entityId: c.id, name: c.name }))
  }

  async suggestPlaces(q: PlaceQuery): Promise<PlaceResult> {
    const wantedTagIds = (q.tags ?? []).map((t) => t.id)
    const matched = wantedTagIds.length
      ? FIXTURE_CANDIDATES.filter((c) =>
          c.tags.some((t) => wantedTagIds.includes(t.id)),
        )
      : FIXTURE_CANDIDATES

    const candidates = matched
      .slice(0, q.take ?? 50)
      .map((c, i) => ({ ...c, providerRank: i + 1 }))

    const seeded = q.entities ?? []
    return {
      candidates,
      explainability: seeded.length
        ? {
            signalEntities: seeded.map((entityId) => ({
              entityId,
              avgScore: 1,
              topN: 3 as const,
            })),
          }
        : null,
      warnings: [],
    }
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/providers/fixture.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/fixture.ts src/lib/providers/fixture.test.ts
git commit -m "feat(providers): add hand-written fixture provider for nine Lagos places"
```

---

### Task 4: Slot assignment

**Files:**
- Create: `src/lib/route/slots.ts`
- Test: `src/lib/route/slots.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `SlotName`, `Tag`.
- Produces: `slotsFor(c: Candidate): SlotName[]`; `slotFit(c: Candidate, slot: SlotName): number`.

- [ ] **Step 1: Write the failing test**

`src/lib/route/slots.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { slotFit, slotsFor } from './slots'
import type { Candidate } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

describe('slotsFor', () => {
  it('puts a cafe in the open slot', () => {
    expect(slotsFor(byId('fx-cafe-neo'))).toEqual(['open'])
  })

  it('puts a restaurant in the main slot', () => {
    expect(slotsFor(byId('fx-nok'))).toContain('main')
  })

  it('puts a cocktail bar in the close slot', () => {
    expect(slotsFor(byId('fx-bar-slate'))).toContain('close')
  })

  it('allows a bakery in both open and close via its dessert tag', () => {
    const slots = slotsFor(byId('fx-bakery-rise'))
    expect(slots).toContain('open')
  })

  it('returns an empty array for a candidate with no recognisable tags', () => {
    const orphan: Candidate = { ...byId('fx-cafe-neo'), category: null, tags: [] }
    expect(slotsFor(orphan)).toEqual([])
  })
})

describe('slotFit', () => {
  it('scores a cocktail bar higher for close than for main', () => {
    const c = byId('fx-bar-slate')
    expect(slotFit(c, 'close')).toBeGreaterThan(slotFit(c, 'main'))
  })

  it('returns zero for a slot the candidate is not eligible for', () => {
    expect(slotFit(byId('fx-cafe-neo'), 'close')).toBe(0)
  })

  it('never exceeds one', () => {
    for (const c of FIXTURE_CANDIDATES) {
      for (const s of ['open', 'main', 'close'] as const) {
        expect(slotFit(c, s)).toBeLessThanOrEqual(1)
      }
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/slots.test.ts`
Expected: FAIL — cannot resolve `./slots`.

- [ ] **Step 3: Write `src/lib/route/slots.ts`**

```ts
import type { Candidate, SlotName } from '../providers/types'

const SLOT_MARKERS: Record<SlotName, { needles: string[]; weight: number }[]> = {
  open: [
    { needles: ['cafe', 'coffee'], weight: 1 },
    { needles: ['bakery', 'dessert', 'patisserie'], weight: 0.9 },
    { needles: ['gallery', 'museum'], weight: 0.8 },
    { needles: ['casual'], weight: 0.6 },
  ],
  main: [
    { needles: ['restaurant'], weight: 1 },
    { needles: ['cuisine', 'nigerian', 'grill', 'kitchen'], weight: 0.85 },
    { needles: ['activity', 'bowling', 'cinema'], weight: 0.7 },
  ],
  close: [
    { needles: ['cocktail_bar', 'cocktails'], weight: 1 },
    { needles: ['bar', 'lounge', 'nightlife', 'club'], weight: 0.9 },
    { needles: ['live_music'], weight: 0.85 },
  ],
}

function haystack(c: Candidate): string {
  return [c.category ?? '', ...c.tags.map((t) => `${t.id} ${t.name}`)]
    .join(' ')
    .toLowerCase()
}

export function slotFit(c: Candidate, slot: SlotName): number {
  const hay = haystack(c)
  let best = 0
  for (const marker of SLOT_MARKERS[slot]) {
    if (marker.needles.some((n) => hay.includes(n))) {
      best = Math.max(best, marker.weight)
    }
  }
  return best
}

export function slotsFor(c: Candidate): SlotName[] {
  return (['open', 'main', 'close'] as const).filter((s) => slotFit(c, s) > 0)
}
```

A cocktail bar's haystack contains `bar` but not `restaurant`, so it scores 1 for `close` and 0 for `main` — which is what the test asserts. `Terrace Nine Kitchen` contains both `restaurant` and `kitchen`, scoring 1 for `main`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/slots.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/route/slots.ts src/lib/route/slots.test.ts
git commit -m "feat(route): assign candidates to open/main/close slots by Qloo tags"
```

---

### Task 5: Scoring

**Files:**
- Create: `src/lib/route/score.ts`
- Test: `src/lib/route/score.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `SlotName`, `slotFit` from Task 4.
- Produces: `scoreCandidate(c: Candidate, slot: SlotName, ctx: ScoreContext): number`; `type ScoreContext = { requestedTagIds: string[]; timeWindow: { startHour: number; endHour: number }; usedCategories: string[] }`.

- [ ] **Step 1: Write the failing test**

`src/lib/route/score.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { scoreCandidate, type ScoreContext } from './score'
import type { Candidate } from '../providers/types'

const base = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  requestedTagIds: [],
  timeWindow: { startHour: 18, endHour: 23 },
  usedCategories: [],
  ...over,
})

describe('scoreCandidate', () => {
  it('rises with affinity, all else equal', () => {
    const low = { ...base('fx-nok'), affinity: 0.2 }
    const high = { ...base('fx-nok'), affinity: 0.9 }
    expect(scoreCandidate(high, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(low, 'main', ctx()),
    )
  })

  it('prefers a candidate matching more of the requested tags', () => {
    const requestedTagIds = [
      'urn:tag:genre:place:restaurant:cocktail_bar',
      'urn:tag:offerings:place:cocktails',
    ]
    const both = base('fx-bar-slate')
    const one = base('fx-bar-afterglow')
    const c = ctx({ requestedTagIds })
    expect(scoreCandidate(both, 'close', c)).toBeGreaterThan(
      scoreCandidate(one, 'close', c),
    )
  })

  it('penalises a closed venue heavily', () => {
    const open = { ...base('fx-closed-kitchen'), isClosed: false }
    const closed = base('fx-closed-kitchen')
    expect(scoreCandidate(open, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(closed, 'main', ctx()) + 0.4,
    )
  })

  it('penalises a category already used by a chosen stop', () => {
    const c = base('fx-yellow-chair')
    expect(scoreCandidate(c, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(c, 'main', ctx({ usedCategories: ['restaurant'] })),
    )
  })

  it('does not rank a null-affinity candidate below an equivalent zero-affinity one', () => {
    const nullAff = { ...base('fx-nok'), affinity: null }
    const zeroAff = { ...base('fx-nok'), affinity: 0 }
    expect(scoreCandidate(nullAff, 'main', ctx())).toBeGreaterThan(
      scoreCandidate(zeroAff, 'main', ctx()),
    )
  })

  it('is deterministic across repeated calls', () => {
    const c = base('fx-bar-slate')
    const runs = Array.from({ length: 5 }, () => scoreCandidate(c, 'close', ctx()))
    expect(new Set(runs).size).toBe(1)
  })

  it('returns a finite number for a candidate missing every optional field', () => {
    const bare: Candidate = {
      id: 'bare',
      name: 'Bare',
      category: 'restaurant',
      lat: null,
      lng: null,
      address: null,
      affinity: null,
      popularity: null,
      isClosed: null,
      hours: null,
      tags: [],
      descriptors: {},
      providerRank: 1,
      providerRef: { provider: 'fixture', entityId: 'bare' },
    }
    expect(Number.isFinite(scoreCandidate(bare, 'main', ctx()))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/score.test.ts`
Expected: FAIL — cannot resolve `./score`.

- [ ] **Step 3: Write `src/lib/route/score.ts`**

Weights come from the spec. A null signal is dropped and the remaining weights are rescaled, so a missing value is neither a zero nor a bonus.

```ts
import type { Candidate, SlotName } from '../providers/types'
import { slotFit } from './slots'

export type ScoreContext = {
  requestedTagIds: string[]
  timeWindow: { startHour: number; endHour: number }
  usedCategories: string[]
}

const WEIGHTS = {
  affinity: 0.4,
  tag: 0.3,
  slot: 0.15,
  descriptor: 0.1,
  popularity: 0.05,
} as const

const PENALTY = {
  duplicateCategory: 0.25,
  closed: 0.5,
  outsideWindow: 0.3,
} as const

function tagMatch(c: Candidate, requestedTagIds: string[]): number | null {
  if (requestedTagIds.length === 0) return null
  const own = new Set(c.tags.map((t) => t.id))
  const hits = requestedTagIds.filter((id) => own.has(id)).length
  return hits / requestedTagIds.length
}

function descriptorMatch(c: Candidate): number | null {
  const filled = [
    c.descriptors.goodFor,
    c.descriptors.ambience,
    c.descriptors.cuisine,
    c.descriptors.liveMusic,
  ].filter((v) => typeof v === 'string' && v.length > 0).length
  if (filled === 0) return null
  return Math.min(1, filled / 3)
}

/** True when the venue is known to be shut during the whole requested window. */
function outsideWindow(c: Candidate, w: ScoreContext['timeWindow']): boolean {
  if (c.hours == null) return false
  const h = c.hours as { openHour?: number; closeHour?: number }
  if (typeof h.openHour !== 'number' || typeof h.closeHour !== 'number') return false
  return h.closeHour <= w.startHour || h.openHour >= w.endHour
}

export function scoreCandidate(
  c: Candidate,
  slot: SlotName,
  ctx: ScoreContext,
): number {
  const terms: { weight: number; value: number }[] = []
  const push = (weight: number, value: number | null) => {
    if (value === null || !Number.isFinite(value)) return
    terms.push({ weight, value: Math.max(0, Math.min(1, value)) })
  }

  push(WEIGHTS.affinity, c.affinity)
  push(WEIGHTS.tag, tagMatch(c, ctx.requestedTagIds))
  push(WEIGHTS.slot, slotFit(c, slot))
  push(WEIGHTS.descriptor, descriptorMatch(c))
  push(WEIGHTS.popularity, c.popularity)

  const totalWeight = terms.reduce((s, t) => s + t.weight, 0)
  let score =
    totalWeight === 0
      ? 0
      : terms.reduce((s, t) => s + (t.weight / totalWeight) * t.value, 0)

  if (c.isClosed === true) score -= PENALTY.closed
  if (c.category && ctx.usedCategories.includes(c.category)) {
    score -= PENALTY.duplicateCategory
  }
  if (outsideWindow(c, ctx.timeWindow)) score -= PENALTY.outsideWindow

  return score
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/score.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/route/score.ts src/lib/route/score.test.ts
git commit -m "feat(route): score candidates with weight redistribution for missing signals"
```

---

### Task 6: Distance and ordering

Covers **Review Focus 3** — a candidate with no coordinates must not poison the maths.

**Files:**
- Create: `src/lib/route/order.ts`
- Test: `src/lib/route/order.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `SlotName`, `Stop`.
- Produces: `haversineMetres(a, b): number | null`; `walkMinutes(metres: number): number`; `orderStops(chosen: Record<SlotName, Candidate>): { slot: SlotName; candidate: Candidate; walkFromPrev?: { metres: number; minutes: number } }[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/route/order.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { haversineMetres, orderStops, walkMinutes } from './order'
import type { Candidate, SlotName } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

describe('haversineMetres', () => {
  it('returns zero for the same point', () => {
    expect(haversineMetres({ lat: 6.43, lng: 3.42 }, { lat: 6.43, lng: 3.42 })).toBe(0)
  })

  it('returns roughly 1.1km for a 0.01 degree latitude step', () => {
    const d = haversineMetres({ lat: 6.43, lng: 3.42 }, { lat: 6.44, lng: 3.42 })
    expect(d).toBeGreaterThan(1050)
    expect(d).toBeLessThan(1160)
  })

  it('returns null when either point lacks coordinates', () => {
    expect(haversineMetres({ lat: null, lng: 3.42 }, { lat: 6.44, lng: 3.42 })).toBeNull()
    expect(haversineMetres({ lat: 6.43, lng: 3.42 }, { lat: null, lng: null })).toBeNull()
  })
})

describe('walkMinutes', () => {
  it('walks 80 metres a minute, rounded up', () => {
    expect(walkMinutes(800)).toBe(10)
    expect(walkMinutes(10)).toBe(1)
  })
})

describe('orderStops', () => {
  const chosen: Record<SlotName, Candidate> = {
    open: byId('fx-gallery-ember'),
    main: byId('fx-nok'),
    close: byId('fx-bar-slate'),
  }

  it('always puts the close slot last', () => {
    expect(orderStops(chosen).at(-1)?.slot).toBe('close')
  })

  it('returns exactly three stops', () => {
    expect(orderStops(chosen)).toHaveLength(3)
  })

  it('picks the permutation with the shorter total walk', () => {
    const ordered = orderStops(chosen)
    const total = ordered.reduce((s, st) => s + (st.walkFromPrev?.metres ?? 0), 0)

    const flipped = [ordered[1], ordered[0], ordered[2]]
    let alt = 0
    for (let i = 1; i < flipped.length; i++) {
      const d = haversineMetres(
        { lat: flipped[i - 1].candidate.lat, lng: flipped[i - 1].candidate.lng },
        { lat: flipped[i].candidate.lat, lng: flipped[i].candidate.lng },
      )
      alt += d ?? 0
    }
    expect(total).toBeLessThanOrEqual(alt)
  })

  it('omits walkFromPrev rather than reporting NaN when a stop has no coordinates', () => {
    const noGeo: Candidate = { ...byId('fx-nok'), lat: null, lng: null }
    const ordered = orderStops({ ...chosen, main: noGeo })
    expect(ordered).toHaveLength(3)
    for (const stop of ordered) {
      if (stop.walkFromPrev) {
        expect(Number.isFinite(stop.walkFromPrev.metres)).toBe(true)
        expect(Number.isFinite(stop.walkFromPrev.minutes)).toBe(true)
      }
    }
  })

  it('never sets walkFromPrev on the first stop', () => {
    expect(orderStops(chosen)[0].walkFromPrev).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/order.test.ts`
Expected: FAIL — cannot resolve `./order`.

- [ ] **Step 3: Write `src/lib/route/order.ts`**

```ts
import type { Candidate, SlotName } from '../providers/types'

type Point = { lat: number | null; lng: number | null }

const EARTH_RADIUS_M = 6_371_000
const WALK_METRES_PER_MINUTE = 80

export function haversineMetres(a: Point, b: Point): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function walkMinutes(metres: number): number {
  return Math.max(1, Math.ceil(metres / WALK_METRES_PER_MINUTE))
}

export type OrderedStop = {
  slot: SlotName
  candidate: Candidate
  walkFromPrev?: { metres: number; minutes: number }
}

/**
 * The close slot is always last, so only the open/main pair can swap.
 * With two permutations this is exact, not heuristic. Legs between stops
 * without coordinates count as zero for comparison and are omitted from
 * the output rather than reported as NaN.
 */
export function orderStops(chosen: Record<SlotName, Candidate>): OrderedStop[] {
  const permutations: SlotName[][] = [
    ['open', 'main', 'close'],
    ['main', 'open', 'close'],
  ]

  const legs = (order: SlotName[]) =>
    order.slice(1).map((slot, i) =>
      haversineMetres(
        { lat: chosen[order[i]].lat, lng: chosen[order[i]].lng },
        { lat: chosen[slot].lat, lng: chosen[slot].lng },
      ),
    )

  const best = permutations.reduce((a, b) => {
    const sum = (o: SlotName[]) => legs(o).reduce((s, d) => s + (d ?? 0), 0)
    return sum(b) < sum(a) ? b : a
  })

  const bestLegs = legs(best)
  return best.map((slot, i) => {
    const metres = i === 0 ? null : bestLegs[i - 1]
    return {
      slot,
      candidate: chosen[slot],
      ...(metres != null && Number.isFinite(metres)
        ? { walkFromPrev: { metres: Math.round(metres), minutes: walkMinutes(metres) } }
        : {}),
    }
  })
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/order.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/route/order.ts src/lib/route/order.test.ts
git commit -m "feat(route): order stops by walking distance with close slot last"
```

---

### Task 7: Evidence and reason text

**Files:**
- Create: `src/lib/route/why.ts`
- Test: `src/lib/route/why.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `Evidence`, `ProviderExplainability`.
- Produces: `buildWhy(c: Candidate, ctx: WhyContext): { why: string; evidence: Evidence[] }`; `type WhyContext = { requestedTagIds: string[]; locality: string; explainability: ProviderExplainability | null; seedNames: Record<string, string> }`.

- [ ] **Step 1: Write the failing test**

`src/lib/route/why.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildWhy, type WhyContext } from './why'
import type { Candidate } from '../providers/types'

const byId = (id: string): Candidate => {
  const c = FIXTURE_CANDIDATES.find((x) => x.id === id)
  if (!c) throw new Error(id)
  return c
}

const ctx = (over: Partial<WhyContext> = {}): WhyContext => ({
  requestedTagIds: [],
  locality: 'Lagos',
  explainability: null,
  seedNames: {},
  ...over,
})

describe('buildWhy', () => {
  it('leads with Qloo explainability when the candidate is in the seeded top three', () => {
    const { why, evidence } = buildWhy(byId('fx-bar-slate'), ctx({
      explainability: { signalEntities: [{ entityId: 'fx-nok', avgScore: 1, topN: 3 }] },
      seedNames: { 'fx-nok': 'Terrace Nine Kitchen' },
    }))
    expect(evidence[0].kind).toBe('explainability')
    expect(why).toContain('Terrace Nine Kitchen')
  })

  it('cites matched tags by name', () => {
    const { why, evidence } = buildWhy(byId('fx-bar-slate'), ctx({
      requestedTagIds: ['urn:tag:genre:place:restaurant:cocktail_bar'],
    }))
    expect(evidence.some((e) => e.kind === 'tag')).toBe(true)
    expect(why).toContain('Cocktail Bar')
  })

  it('marks every piece of evidence as sourced from qloo', () => {
    const { evidence } = buildWhy(byId('fx-nok'), ctx())
    expect(evidence.length).toBeGreaterThan(0)
    expect(evidence.every((e) => e.source === 'qloo')).toBe(true)
  })

  it('includes the affinity score as evidence when present', () => {
    const { evidence } = buildWhy(byId('fx-nok'), ctx())
    const aff = evidence.find((e) => e.kind === 'affinity')
    expect(aff?.value).toBe(0.88)
  })

  it('falls back to neutral factual text when there is no evidence at all', () => {
    const bare: Candidate = {
      ...byId('fx-nok'),
      affinity: null,
      popularity: null,
      tags: [],
      descriptors: {},
    }
    const { why, evidence } = buildWhy(bare, ctx())
    expect(evidence).toEqual([])
    expect(why).toBe('A restaurant in Lagos.')
  })

  it('never invents a rationale for a candidate stripped of all signal', () => {
    const bare: Candidate = {
      ...byId('fx-nok'),
      category: null,
      affinity: null,
      popularity: null,
      tags: [],
      descriptors: {},
    }
    const { why } = buildWhy(bare, ctx())
    expect(why).toBe('A place in Lagos.')
    expect(why).not.toMatch(/perfect|great|ideal|vibe|you.ll love/i)
  })

  it('is deterministic for the same input', () => {
    const a = buildWhy(byId('fx-bar-slate'), ctx())
    const b = buildWhy(byId('fx-bar-slate'), ctx())
    expect(a.why).toBe(b.why)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/why.test.ts`
Expected: FAIL — cannot resolve `./why`.

- [ ] **Step 3: Write `src/lib/route/why.ts`**

```ts
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
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/why.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/route/why.ts src/lib/route/why.test.ts
git commit -m "feat(route): build reasons from Qloo evidence only, with neutral fallback"
```

---

### Task 8: Signal assessment

**Files:**
- Create: `src/lib/route/assess.ts`
- Test: `src/lib/route/assess.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `Confidence`, `SlotName`, `slotsFor` from Task 4.
- Produces: `assessSignal(candidates: Candidate[]): { confidence: Confidence; perSlot: Record<SlotName, number>; medianAffinity: number | null; reason: string }`.

- [ ] **Step 1: Write the failing test**

`src/lib/route/assess.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { assessSignal } from './assess'
import type { Candidate } from '../providers/types'

describe('assessSignal', () => {
  it('calls a full fixture set strong', () => {
    expect(assessSignal(FIXTURE_CANDIDATES).confidence).toBe('strong')
  })

  it('calls an empty set weak and says so', () => {
    const r = assessSignal([])
    expect(r.confidence).toBe('weak')
    expect(r.reason).toMatch(/no/i)
  })

  it('calls a set with fewer than six eligible candidates weak', () => {
    expect(assessSignal(FIXTURE_CANDIDATES.slice(0, 4)).confidence).toBe('weak')
  })

  it('calls a set weak when median affinity is below 0.3', () => {
    const dull: Candidate[] = FIXTURE_CANDIDATES.map((c) => ({ ...c, affinity: 0.1 }))
    expect(assessSignal(dull).confidence).toBe('weak')
  })

  it('names the thin slot in its reason', () => {
    const noBars = FIXTURE_CANDIDATES.filter((c) => !c.category?.includes('bar') && c.category !== 'lounge')
    expect(assessSignal(noBars).reason.toLowerCase()).toContain('close')
  })

  it('counts eligible candidates per slot', () => {
    const r = assessSignal(FIXTURE_CANDIDATES)
    expect(r.perSlot.open).toBeGreaterThanOrEqual(3)
    expect(r.perSlot.main).toBeGreaterThanOrEqual(3)
    expect(r.perSlot.close).toBeGreaterThanOrEqual(3)
  })

  it('reports null median affinity when no candidate has one', () => {
    const none: Candidate[] = FIXTURE_CANDIDATES.map((c) => ({ ...c, affinity: null }))
    expect(assessSignal(none).medianAffinity).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/assess.test.ts`
Expected: FAIL — cannot resolve `./assess`.

- [ ] **Step 3: Write `src/lib/route/assess.ts`**

```ts
import type { Candidate, Confidence, SlotName } from '../providers/types'
import { slotsFor } from './slots'

const SLOTS: SlotName[] = ['open', 'main', 'close']
const MIN_ELIGIBLE = 6
const MIN_MEDIAN_AFFINITY = 0.3
const STRONG_PER_SLOT = 3

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function assessSignal(candidates: Candidate[]): {
  confidence: Confidence
  perSlot: Record<SlotName, number>
  medianAffinity: number | null
  reason: string
} {
  const open = candidates.filter((c) => !c.isClosed)
  const perSlot = SLOTS.reduce(
    (acc, slot) => {
      acc[slot] = open.filter((c) => slotsFor(c).includes(slot)).length
      return acc
    },
    { open: 0, main: 0, close: 0 } as Record<SlotName, number>,
  )

  const eligible = open.filter((c) => slotsFor(c).length > 0)
  const medianAffinity = median(
    open.map((c) => c.affinity).filter((a): a is number => a != null),
  )

  const emptySlots = SLOTS.filter((s) => perSlot[s] === 0)
  const thinSlots = SLOTS.filter((s) => perSlot[s] > 0 && perSlot[s] < STRONG_PER_SLOT)

  if (candidates.length === 0) {
    return { confidence: 'weak', perSlot, medianAffinity, reason: 'Qloo returned no places for this search.' }
  }
  if (emptySlots.length > 0) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason: `Nothing matched the ${emptySlots.join(' or ')} part of the evening.`,
    }
  }
  if (eligible.length < MIN_ELIGIBLE) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason: `Only ${eligible.length} usable places came back, which is too few to choose well.`,
    }
  }
  if (medianAffinity != null && medianAffinity < MIN_MEDIAN_AFFINITY) {
    return {
      confidence: 'weak',
      perSlot,
      medianAffinity,
      reason: 'The taste match across these places is low, so this is a guess rather than a recommendation.',
    }
  }
  if (thinSlots.length > 0) {
    return {
      confidence: 'ok',
      perSlot,
      medianAffinity,
      reason: `Thin choice for the ${thinSlots.join(' and ')} part of the evening.`,
    }
  }
  return { confidence: 'strong', perSlot, medianAffinity, reason: 'Good coverage across all three stops.' }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/assess.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/route/assess.ts src/lib/route/assess.test.ts
git commit -m "feat(route): assess signal strength and name the thin slot"
```

---

### Task 9: Route composition

Covers **Review Focus 2** (one place in two slots) and **Review Focus 4** (fewer than three fillable slots).

**Files:**
- Create: `src/lib/route/build.ts`
- Test: `src/lib/route/build.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–8.
- Produces: `buildRoute(input: BuildInput): Route | { error: 'insufficient'; unfilledSlots: SlotName[]; reason: string }`; `type BuildInput = { candidates: Candidate[]; request: RouteRequest; locality: Locality; requestedTagIds: string[]; explainability: ProviderExplainability | null; seedNames: Record<string, string>; trace: TraceEntry[]; providerKind: 'qloo' | 'fixture' }`.

- [ ] **Step 1: Write the failing test**

`src/lib/route/build.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute, type BuildInput } from './build'
import type { Candidate } from '../providers/types'

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  candidates: FIXTURE_CANDIDATES,
  request: { city: 'Lagos', mood: 'low-key but not dead', timeWindow: { startHour: 18, endHour: 23 } },
  locality: { name: 'Lagos' },
  requestedTagIds: [],
  explainability: null,
  seedNames: {},
  trace: [],
  providerKind: 'fixture',
  ...over,
})

describe('buildRoute', () => {
  it('returns exactly three stops in order 1, 2, 3', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.map((s) => s.order)).toEqual([1, 2, 3])
  })

  it('never repeats a place across stops', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    const ids = r.stops.map((s) => s.candidate.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('never repeats a category across stops', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    const cats = r.stops.map((s) => s.candidate.category)
    expect(new Set(cats).size).toBe(3)
  })

  it('does not place a venue eligible for two slots into both', () => {
    // A single place tagged as both restaurant and cocktail bar.
    const hybrid: Candidate = {
      ...FIXTURE_CANDIDATES[0],
      id: 'fx-hybrid',
      name: 'Hybrid House',
      category: 'restaurant',
      affinity: 0.99,
      tags: [
        { id: 'urn:tag:genre:place:restaurant', name: 'Restaurant', type: 'urn:tag:genre:place', popularity: 0.99 },
        { id: 'urn:tag:genre:place:restaurant:cocktail_bar', name: 'Cocktail Bar', type: 'urn:tag:genre:place', popularity: 0.99 },
      ],
      providerRef: { provider: 'fixture', entityId: 'fx-hybrid' },
    }
    const r = buildRoute(input({ candidates: [...FIXTURE_CANDIDATES, hybrid] }))
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.filter((s) => s.candidate.id === 'fx-hybrid').length).toBeLessThanOrEqual(1)
  })

  it('excludes closed venues', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.some((s) => s.candidate.isClosed === true)).toBe(false)
  })

  it('returns an insufficient error naming the unfilled slot rather than a short route', () => {
    const cafesOnly = FIXTURE_CANDIDATES.filter((c) => c.category === 'cafe')
    const r = buildRoute(input({ candidates: cafesOnly }))
    expect('error' in r).toBe(true)
    if (!('error' in r)) return
    expect(r.unfilledSlots).toContain('main')
    expect(r.unfilledSlots).toContain('close')
  })

  it('carries the provider kind through so the UI can disclose fixtures', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.providerKind).toBe('fixture')
  })

  it('surfaces alternatives when confidence is weak', () => {
    const thin = [
      ...FIXTURE_CANDIDATES.filter((c) => c.category === 'cafe'),
      ...FIXTURE_CANDIDATES.filter((c) => c.category === 'restaurant').slice(0, 1),
      ...FIXTURE_CANDIDATES.filter((c) => c.category === 'cocktail_bar').slice(0, 1),
    ]
    const r = buildRoute(input({ candidates: thin }))
    if ('error' in r) throw new Error('expected a route')
    expect(r.confidence).toBe('weak')
    expect(r.alternatives.length).toBeGreaterThan(0)
  })

  it('produces identical output for identical input', () => {
    const a = buildRoute(input())
    const b = buildRoute(input())
    if ('error' in a || 'error' in b) throw new Error('expected routes')
    expect(a.stops.map((s) => s.candidate.id)).toEqual(b.stops.map((s) => s.candidate.id))
    expect(a.stops.map((s) => s.why)).toEqual(b.stops.map((s) => s.why))
  })

  it('gives every stop a non-empty reason', () => {
    const r = buildRoute(input())
    if ('error' in r) throw new Error('expected a route')
    expect(r.stops.every((s) => s.why.length > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/route/build.test.ts`
Expected: FAIL — cannot resolve `./build`.

- [ ] **Step 3: Write `src/lib/route/build.ts`**

Slots are filled in a fixed order and each chosen candidate is removed from the pool, which is what prevents a hybrid venue occupying two stops.

```ts
import type {
  Candidate,
  Locality,
  ProviderExplainability,
  Route,
  RouteRequest,
  SlotName,
  Stop,
  TraceEntry,
} from '../providers/types'
import { assessSignal } from './assess'
import { orderStops } from './order'
import { scoreCandidate, type ScoreContext } from './score'
import { slotsFor } from './slots'
import { buildWhy } from './why'

export type BuildInput = {
  candidates: Candidate[]
  request: RouteRequest
  locality: Locality
  requestedTagIds: string[]
  explainability: ProviderExplainability | null
  seedNames: Record<string, string>
  trace: TraceEntry[]
  providerKind: 'qloo' | 'fixture'
}

export type BuildFailure = {
  error: 'insufficient'
  unfilledSlots: SlotName[]
  reason: string
}

/** main first: it anchors the evening, so it gets the best of the pool. */
const FILL_ORDER: SlotName[] = ['main', 'close', 'open']

export function buildRoute(input: BuildInput): Route | BuildFailure {
  const assessment = assessSignal(input.candidates)

  const pool = input.candidates.filter((c) => c.isClosed !== true)
  const chosen = {} as Record<SlotName, Candidate>
  const usedCategories: string[] = []
  const takenIds = new Set<string>()
  const unfilledSlots: SlotName[] = []

  for (const slot of FILL_ORDER) {
    const ctx: ScoreContext = {
      requestedTagIds: input.requestedTagIds,
      timeWindow: input.request.timeWindow,
      usedCategories,
    }

    const eligible = pool
      .filter((c) => !takenIds.has(c.id) && slotsFor(c).includes(slot))
      .map((c) => ({ c, score: scoreCandidate(c, slot, ctx) }))
      .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))

    const winner = eligible[0]?.c
    if (!winner) {
      unfilledSlots.push(slot)
      continue
    }

    chosen[slot] = winner
    takenIds.add(winner.id)
    if (winner.category) usedCategories.push(winner.category)
  }

  if (unfilledSlots.length > 0) {
    return {
      error: 'insufficient',
      unfilledSlots,
      reason: `Could not fill the ${unfilledSlots.join(' or ')} part of the evening from what Qloo returned.`,
    }
  }

  const ordered = orderStops(chosen)
  const whyCtx = {
    requestedTagIds: input.requestedTagIds,
    locality: input.locality.name,
    explainability: input.explainability,
    seedNames: input.seedNames,
  }

  const stops = ordered.map((o, i) => {
    const { why, evidence } = buildWhy(o.candidate, whyCtx)
    return {
      order: (i + 1) as 1 | 2 | 3,
      slot: o.slot,
      candidate: o.candidate,
      why,
      evidence,
      ...(o.walkFromPrev ? { walkFromPrev: o.walkFromPrev } : {}),
    } satisfies Stop
  }) as [Stop, Stop, Stop]

  const alternatives =
    assessment.confidence === 'weak'
      ? pool.filter((c) => !takenIds.has(c.id)).slice(0, 6)
      : []

  return {
    id: `${input.locality.name.toLowerCase().replace(/\s+/g, '-')}-${stops
      .map((s) => s.candidate.id)
      .join('_')}`,
    locality: input.locality,
    mood: input.request.mood,
    createdAt: new Date().toISOString(),
    stops,
    confidence: assessment.confidence,
    alternatives,
    trace: input.trace,
    providerKind: input.providerKind,
    unfilledSlots: [],
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/route/build.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all tests from Tasks 1–9 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/route/build.ts src/lib/route/build.test.ts
git commit -m "feat(route): compose three-stop routes with no repeated place or category"
```

---

### Task 10: Qloo provider

Covers **Review Focus 1** — an unknown city must produce a readable message.

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/providers/qloo.ts`
- Test: `src/lib/providers/qloo.test.ts`
- Test: `src/lib/providers/qloo.live.test.ts`

**Interfaces:**
- Consumes: Task 2's types, schemas and `buildInsightsParams`.
- Produces: `QlooProvider` implementing `TasteProvider` with `kind = 'qloo'`, constructor `(opts?: { baseUrl?: string; apiKey?: string; fetchImpl?: typeof fetch })`; `UnknownLocalityError`; `serverEnv()` returning `{ qlooBaseUrl, qlooApiKey, modelBaseUrl, modelApiKey, model }`.

- [ ] **Step 1: Write `src/lib/env.ts`**

Server-only, and it never logs a value.

```ts
import 'server-only'

export type ServerEnv = {
  qlooBaseUrl: string
  qlooApiKey: string
  modelBaseUrl: string | undefined
  modelApiKey: string
  model: string
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

export function serverEnv(): ServerEnv {
  return {
    qlooBaseUrl: process.env.QLOO_API_BASE_URL ?? 'https://hackathon.api.qloo.com',
    qlooApiKey: required('QLOO_API_KEY'),
    modelBaseUrl: process.env.OPENAI_BASE_URL,
    modelApiKey: process.env.OPENROUTER_API_KEY ?? required('OPENAI_API_KEY'),
    model: process.env.TASTEROUTE_MODEL ?? 'openai/gpt-5-mini',
  }
}

export function hasModelAccess(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY)
}
```

- [ ] **Step 2: Write the failing provider test with a stubbed fetch**

`src/lib/providers/qloo.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { QlooProvider, UnknownLocalityError } from './qloo'

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const provider = (fetchImpl: typeof fetch) =>
  new QlooProvider({ baseUrl: 'https://hackathon.example', apiKey: 'test-key', fetchImpl })

describe('QlooProvider', () => {
  it('sends the key in the X-Api-Key header and never in the URL', async () => {
    const spy = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).not.toContain('test-key')
      return ok({ success: true, results: { tags: [] } })
    })
    await provider(spy as unknown as typeof fetch).findTags('cocktail')
    const [, init] = spy.mock.calls[0] as unknown as [unknown, RequestInit]
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('test-key')
    expect(JSON.stringify(init.headers)).not.toContain('Bearer')
  })

  it('maps a Qloo place entity onto our Candidate shape', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'abc',
              name: 'Slate & Smoke',
              subtype: 'urn:entity:place',
              popularity: 0.79,
              tags: [
                {
                  id: 'urn:tag:genre:place:restaurant:cocktail_bar',
                  name: 'Cocktail Bar',
                  type: 'urn:tag:genre:place',
                  popularity: 0.99,
                },
              ],
              properties: {
                address: '21 Adeola Odeku St',
                geocode: { latitude: 6.4319, longitude: 3.4301 },
                good_for: 'a late drink',
                business_rating: 4.4,
                is_closed: false,
              },
              query: { affinity: 0.86 },
            },
          ],
        },
      })

    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates[0]).toMatchObject({
      id: 'abc',
      name: 'Slate & Smoke',
      lat: 6.4319,
      lng: 3.4301,
      affinity: 0.86,
      address: '21 Adeola Odeku St',
      providerRank: 1,
    })
    expect(candidates[0].descriptors.goodFor).toBe('a late drink')
    expect(candidates[0].providerRef).toEqual({ provider: 'qloo', entityId: 'abc' })
  })

  it('throws UnknownLocalityError on a 400 from an unmatched city', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: 'no locality found' }), { status: 400 })
    await expect(
      provider(fetchImpl as unknown as typeof fetch).suggestPlaces({ locality: 'Nowhereville' }),
    ).rejects.toBeInstanceOf(UnknownLocalityError)
  })

  it('gives UnknownLocalityError a message naming the city', async () => {
    const fetchImpl = async () => new Response('{}', { status: 400 })
    await provider(fetchImpl as unknown as typeof fetch)
      .suggestPlaces({ locality: 'Nowhereville' })
      .catch((e: Error) => {
        expect(e.message).toContain('Nowhereville')
      })
  })

  it('requests explainability only when entities are seeded', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    const p = provider(fetchImpl as unknown as typeof fetch)
    await p.suggestPlaces({ locality: 'Lagos', tags: [{ id: 'urn:tag:x' }] })
    await p.suggestPlaces({ locality: 'Lagos', entities: ['abc'] })
    expect(urls[0]).not.toContain('feature.explainability')
    expect(urls[1]).toContain('feature.explainability=true')
  })

  it('caps take at the Qloo maximum of 50', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
      take: 500,
    })
    expect(urls[0]).toContain('take=50')
  })

  it('normalises Qloo explainability into our shape', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: { entities: [] },
        query: {
          explainability: {
            'signal.interests.entities': {
              effect_on_top3_recs: [{ entity_id: 'seed-1', avg_score: 1 }],
            },
          },
        },
      })
    const { explainability } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
      entities: ['seed-1'],
    })
    expect(explainability?.signalEntities).toEqual([
      { entityId: 'seed-1', avgScore: 1, topN: 3 },
    ])
  })

  it('collects warnings so weak explainability is visible', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: { entities: [] },
        warnings: [{ type: 'Could not calculate explainability' }],
      })
    const { warnings } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(warnings[0]).toContain('explainability')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/providers/qloo.test.ts`
Expected: FAIL — cannot resolve `./qloo`.

- [ ] **Step 4: Write `src/lib/providers/qloo.ts`**

```ts
import { buildInsightsParams } from './params'
import {
  qlooInsightsSchema,
  qlooSearchSchema,
  qlooTagsSchema,
  type QlooInsightsResponse,
} from './schemas'
import type {
  Candidate,
  EntityRef,
  PlaceQuery,
  PlaceResult,
  ProviderExplainability,
  Tag,
  TasteProvider,
} from './types'

export class UnknownLocalityError extends Error {
  constructor(locality: string) {
    super(
      `Qloo has no locality matching "${locality}". Try a larger nearby city.`,
    )
    this.name = 'UnknownLocalityError'
  }
}

export class QlooRequestError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`Qloo ${endpoint} returned ${status}`)
    this.name = 'QlooRequestError'
  }
}

const MAX_TAKE = 50
const TOP_N_KEYS = [
  ['effect_on_top3_recs', 3],
  ['effect_on_top5_recs', 5],
  ['effect_on_top10_recs', 10],
  ['effect_on_all_recs', 'all'],
] as const

export class QlooProvider implements TasteProvider {
  readonly kind = 'qloo' as const
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: { baseUrl?: string; apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.QLOO_API_BASE_URL ?? 'https://hackathon.api.qloo.com').replace(/\/$/, '')
    this.apiKey = opts.apiKey ?? process.env.QLOO_API_KEY ?? ''
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private async get(path: string, params: URLSearchParams): Promise<unknown> {
    const url = `${this.baseUrl}${path}?${params.toString()}`
    const res = await this.fetchImpl(url, {
      headers: { 'X-Api-Key': this.apiKey, accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new QlooRequestError(res.status, path)
    return res.json()
  }

  async findTags(query: string): Promise<Tag[]> {
    const params = new URLSearchParams({ 'filter.query': query, take: '12' })
    const raw = await this.get('/v2/tags', params)
    const parsed = qlooTagsSchema.parse(raw)
    return parsed.results.tags.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      popularity: t.popularity ?? 0,
    }))
  }

  async seedEntities(names: string[]): Promise<EntityRef[]> {
    const found: EntityRef[] = []
    for (const name of names.slice(0, 5)) {
      const params = new URLSearchParams({ query: name, take: '1' })
      const raw = await this.get('/search', params)
      const parsed = qlooSearchSchema.parse(raw)
      const list = Array.isArray(parsed.results)
        ? parsed.results
        : (parsed.results?.entities ?? [])
      const first = list[0]
      if (first) found.push({ entityId: first.entity_id, name: first.name })
    }
    return found
  }

  async suggestPlaces(q: PlaceQuery): Promise<PlaceResult> {
    const seeded = (q.entities ?? []).length > 0
    const params = buildInsightsParams({
      'filter.type': 'urn:entity:place',
      'filter.location.query': q.locality,
      'signal.interests.tags': q.tags?.length
        ? q.tags.map((t) => t.id).join(',')
        : undefined,
      'signal.interests.entities': seeded ? q.entities!.join(',') : undefined,
      // Qloo cannot compute explainability for tag signals, so only ask when seeded.
      'feature.explainability': seeded ? true : undefined,
      take: Math.min(q.take ?? 20, MAX_TAKE),
    })

    let raw: unknown
    try {
      raw = await this.get('/v2/insights', params)
    } catch (e) {
      if (e instanceof QlooRequestError && e.status === 400) {
        throw new UnknownLocalityError(q.locality)
      }
      throw e
    }

    const parsed = qlooInsightsSchema.parse(raw)
    return {
      candidates: parsed.results.entities.map(toCandidate),
      explainability: toExplainability(parsed),
      warnings: (parsed.warnings ?? []).map((w) => w.type),
    }
  }
}

function toCandidate(
  e: QlooInsightsResponse['results']['entities'][number],
  index: number,
): Candidate {
  const p = e.properties ?? {}
  const geo = p.geocode as { latitude?: number; longitude?: number } | undefined
  const lat = geo?.latitude ?? e.location?.lat ?? null
  const lng = geo?.longitude ?? e.location?.lon ?? null

  return {
    id: e.entity_id,
    name: e.name,
    category: categoryOf(e.tags ?? []),
    lat,
    lng,
    address: p.address ?? null,
    affinity: e.query?.affinity ?? null,
    popularity: e.popularity ?? null,
    isClosed: p.is_closed ?? null,
    hours: p.hours ?? null,
    tags: (e.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      popularity: t.popularity ?? 0,
    })),
    descriptors: {
      goodFor: p.good_for,
      ambience: p.ambience_description,
      cuisine: p.cuisine_description,
      cost: p.cost_description,
      liveMusic: p.live_music,
      rating: p.business_rating,
    },
    providerRank: index + 1,
    providerRef: { provider: 'qloo', entityId: e.entity_id },
  }
}

/** The most specific genre tag is the closest thing Qloo gives to a category. */
function categoryOf(tags: { id: string; type: string }[]): string | null {
  const genre = tags.find((t) => t.type.startsWith('urn:tag:genre:place'))
  if (!genre) return null
  const parts = genre.id.split(':')
  return parts.at(-1) ?? null
}

function toExplainability(
  parsed: QlooInsightsResponse,
): ProviderExplainability | null {
  const block = parsed.query?.explainability?.['signal.interests.entities']
  if (!block) return null

  const signalEntities: ProviderExplainability['signalEntities'] = []
  const seen = new Set<string>()
  for (const [key, topN] of TOP_N_KEYS) {
    for (const effect of block[key] ?? []) {
      if (seen.has(effect.entity_id)) continue
      seen.add(effect.entity_id)
      signalEntities.push({
        entityId: effect.entity_id,
        avgScore: effect.avg_score,
        topN,
      })
    }
  }
  return signalEntities.length > 0 ? { signalEntities } : null
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/lib/providers/qloo.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the live smoke test, skipped without a key**

`src/lib/providers/qloo.live.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { QlooProvider } from './qloo'

const hasKey = Boolean(process.env.QLOO_API_KEY)

describe.skipIf(!hasKey)('QlooProvider against the live hackathon host', () => {
  it('returns places for Lagos', async () => {
    const { candidates } = await new QlooProvider().suggestPlaces({
      locality: 'Lagos',
      take: 10,
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].name).toBeTruthy()
  }, 20_000)

  it('returns real tag urns for a mood word', async () => {
    const tags = await new QlooProvider().findTags('cocktail')
    expect(tags.some((t) => t.id.includes('cocktail'))).toBe(true)
  }, 20_000)
})
```

- [ ] **Step 7: Run the live test with the key loaded**

```bash
cd ~/Techclave/tasteroute
set -a && . ./.env.local && set +a && npx vitest run src/lib/providers/qloo.live.test.ts
```
Expected: PASS, 2 tests. If it skips, the env did not load.

- [ ] **Step 8: Commit**

```bash
git add src/lib/env.ts src/lib/providers/qloo.ts src/lib/providers/qloo.test.ts src/lib/providers/qloo.live.test.ts
git commit -m "feat(providers): add Qloo provider with locality errors and normalised explainability"
```

---

### Task 11: Agent tools and budget

**Files:**
- Create: `src/lib/agent/budget.ts`
- Create: `src/lib/agent/tools.ts`
- Test: `src/lib/agent/budget.test.ts`, `src/lib/agent/tools.test.ts`

**Interfaces:**
- Consumes: `TasteProvider`, `Candidate`, `Tag`, `RouteRequest`, `Locality`, `TraceEntry`, `buildRoute`, `assessSignal`.
- Produces: `Budget` class with `consumeRound(): boolean`, `roundsUsed: number`, `exhausted: boolean`; `createSession(opts): AgentSession`; `AgentSession` with `tools` (OpenAI tool definitions), `dispatch(name, args): Promise<unknown>`, `pool: Candidate[]`, `trace: TraceEntry[]`, `finalRoute`.

- [ ] **Step 1: Write the failing budget test**

`src/lib/agent/budget.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Budget } from './budget'

describe('Budget', () => {
  it('allows the configured number of rounds then stops', () => {
    const b = new Budget(3)
    expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(false)
  })

  it('reports rounds used', () => {
    const b = new Budget(6)
    b.consumeRound()
    b.consumeRound()
    expect(b.roundsUsed).toBe(2)
  })

  it('reports exhaustion', () => {
    const b = new Budget(1)
    expect(b.exhausted).toBe(false)
    b.consumeRound()
    expect(b.exhausted).toBe(true)
  })

  it('defaults to six rounds, matching the spec cap', () => {
    const b = new Budget()
    for (let i = 0; i < 6; i++) expect(b.consumeRound()).toBe(true)
    expect(b.consumeRound()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/agent/budget.test.ts`
Expected: FAIL — cannot resolve `./budget`.

- [ ] **Step 3: Write `src/lib/agent/budget.ts`**

```ts
export const DEFAULT_MAX_ROUNDS = 6

export class Budget {
  private used = 0

  constructor(private readonly maxRounds: number = DEFAULT_MAX_ROUNDS) {}

  consumeRound(): boolean {
    if (this.used >= this.maxRounds) return false
    this.used += 1
    return true
  }

  get roundsUsed(): number {
    return this.used
  }

  get exhausted(): boolean {
    return this.used >= this.maxRounds
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/budget.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tools test**

`src/lib/agent/tools.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { createSession } from './tools'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Lagos',
  mood: 'low-key but not dead',
  timeWindow: { startHour: 18, endHour: 23 },
}

const session = () =>
  createSession({
    provider: new FixtureProvider(),
    request,
    locality: { name: 'Lagos' },
  })

describe('createSession', () => {
  it('exposes exactly the four tools the agent may call', () => {
    const names = session().tools.map((t) => t.function.name).sort()
    expect(names).toEqual(['find_tags', 'finalize_route', 'seed_entities', 'suggest_places'])
  })

  it('declares no tool that lets the model choose the stops', () => {
    const json = JSON.stringify(session().tools)
    expect(json).not.toContain('candidateIds')
    expect(json).not.toContain('stops')
  })

  it('returns tags from find_tags', async () => {
    const s = session()
    const out = (await s.dispatch('find_tags', { query: 'cocktail' })) as { tags: unknown[] }
    expect(out.tags.length).toBeGreaterThan(0)
  })

  it('accumulates candidates into the pool across suggest_places calls', async () => {
    const s = session()
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    const afterFirst = s.pool.length
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:restaurant:cocktail_bar'] })
    expect(s.pool.length).toBeGreaterThan(afterFirst)
  })

  it('deduplicates candidates already in the pool', async () => {
    const s = session()
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    const afterFirst = s.pool.length
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    expect(s.pool.length).toBe(afterFirst)
  })

  it('returns an assessment with suggest_places so the agent can decide to widen', async () => {
    const s = session()
    const out = (await s.dispatch('suggest_places', {
      tagIds: ['urn:tag:genre:place:cafe'],
    })) as { assessment: { confidence: string; reason: string } }
    expect(['strong', 'ok', 'weak']).toContain(out.assessment.confidence)
    expect(out.assessment.reason).toBeTruthy()
  })

  it('builds a route from the accumulated pool on finalize_route', async () => {
    const s = session()
    await s.dispatch('suggest_places', {})
    const out = (await s.dispatch('finalize_route', {})) as { ok: boolean }
    expect(out.ok).toBe(true)
    expect(s.finalRoute?.stops).toHaveLength(3)
  })

  it('reports the unfilled slot instead of throwing when the pool is too thin', async () => {
    const s = session()
    await s.dispatch('suggest_places', { tagIds: ['urn:tag:genre:place:cafe'] })
    const out = (await s.dispatch('finalize_route', {})) as {
      ok: boolean
      unfilledSlots?: string[]
    }
    expect(out.ok).toBe(false)
    expect(out.unfilledSlots).toContain('close')
  })

  it('records a trace entry per dispatch without leaking the api key', async () => {
    const s = session()
    await s.dispatch('find_tags', { query: 'cocktail' })
    expect(s.trace).toHaveLength(1)
    expect(s.trace[0].tool).toBe('find_tags')
    expect(JSON.stringify(s.trace)).not.toMatch(/hack_[0-9a-f]/)
  })

  it('rejects an unknown tool name', async () => {
    await expect(session().dispatch('rm_rf', {})).rejects.toThrow(/unknown tool/i)
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run src/lib/agent/tools.test.ts`
Expected: FAIL — cannot resolve `./tools`.

- [ ] **Step 7: Write `src/lib/agent/tools.ts`**

The four tools give the model real choices — which mood words to resolve, which tags to pursue, whether to widen, when to stop — and no way to pick or order the stops.

```ts
import { assessSignal } from '../route/assess'
import { buildRoute } from '../route/build'
import type {
  Candidate,
  EntityRef,
  Locality,
  ProviderExplainability,
  Route,
  RouteRequest,
  TasteProvider,
  TraceEntry,
} from '../providers/types'

export type ToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'find_tags',
      description:
        'Turn a mood word or phrase into real Qloo tag ids. Call this first, and more than once if the mood has several parts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'One mood word, e.g. "cocktail" or "quiet"' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'seed_entities',
      description:
        'Resolve named places the user already likes into Qloo entity ids. Seeding with entities is the only way Qloo will return explainability, so use it when the user names somewhere.',
      parameters: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
        required: ['names'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_places',
      description:
        'Ask Qloo for places in the chosen city, filtered by tag ids and optionally seeded with entity ids. Results are added to the candidate pool. Returns a signal assessment: if it says weak, call again with broader or different tags.',
      parameters: {
        type: 'object',
        properties: {
          tagIds: { type: 'array', items: { type: 'string' } },
          entityIds: { type: 'array', items: { type: 'string' } },
          take: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_route',
      description:
        'Build the route from everything gathered so far. TasteRoute chooses, scores and orders the three stops; you do not. Call this once the pool is good enough.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
]

export type AgentSession = {
  tools: ToolDefinition[]
  pool: Candidate[]
  trace: TraceEntry[]
  finalRoute: Route | null
  requestedTagIds: string[]
  dispatch(name: string, args: Record<string, unknown>): Promise<unknown>
}

export function createSession(opts: {
  provider: TasteProvider
  request: RouteRequest
  locality: Locality
}): AgentSession {
  const { provider, request, locality } = opts

  const pool: Candidate[] = []
  const trace: TraceEntry[] = []
  const requestedTagIds: string[] = []
  const seedNames: Record<string, string> = {}
  let explainability: ProviderExplainability | null = null
  let finalRoute: Route | null = null

  const addToPool = (candidates: Candidate[]): number => {
    const known = new Set(pool.map((c) => c.id))
    let added = 0
    for (const c of candidates) {
      if (known.has(c.id)) continue
      known.add(c.id)
      pool.push(c)
      added += 1
    }
    return added
  }

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ result: unknown; summary: string }>> = {
    async find_tags(args) {
      const tags = await provider.findTags(String(args.query ?? ''))
      return {
        result: { tags: tags.map((t) => ({ id: t.id, name: t.name, popularity: t.popularity })) },
        summary: `${tags.length} tags for "${String(args.query ?? '')}"`,
      }
    },

    async seed_entities(args) {
      const names = Array.isArray(args.names) ? args.names.map(String) : []
      const entities: EntityRef[] = await provider.seedEntities(names)
      for (const e of entities) seedNames[e.entityId] = e.name
      return {
        result: { entities },
        summary: `resolved ${entities.length} of ${names.length} named places`,
      }
    },

    async suggest_places(args) {
      const tagIds = Array.isArray(args.tagIds) ? args.tagIds.map(String) : []
      const entityIds = Array.isArray(args.entityIds) ? args.entityIds.map(String) : []
      for (const id of tagIds) if (!requestedTagIds.includes(id)) requestedTagIds.push(id)

      const res = await provider.suggestPlaces({
        locality: locality.name,
        tags: tagIds.map((id) => ({ id })),
        entities: entityIds,
        take: typeof args.take === 'number' ? args.take : 30,
      })
      if (res.explainability) explainability = res.explainability

      const added = addToPool(res.candidates)
      const assessment = assessSignal(pool)

      return {
        result: {
          added,
          poolSize: pool.length,
          names: res.candidates.slice(0, 8).map((c) => c.name),
          assessment: { confidence: assessment.confidence, reason: assessment.reason, perSlot: assessment.perSlot },
          warnings: res.warnings,
        },
        summary: `+${added} places, pool ${pool.length}, signal ${assessment.confidence}`,
      }
    },

    async finalize_route() {
      const built = buildRoute({
        candidates: pool,
        request,
        locality,
        requestedTagIds,
        explainability,
        seedNames,
        trace,
        providerKind: provider.kind,
      })

      if ('error' in built) {
        return {
          result: { ok: false, unfilledSlots: built.unfilledSlots, reason: built.reason },
          summary: `could not fill ${built.unfilledSlots.join(', ')}`,
        }
      }

      finalRoute = built
      return {
        result: {
          ok: true,
          confidence: built.confidence,
          stops: built.stops.map((s) => ({ order: s.order, slot: s.slot, name: s.candidate.name, why: s.why })),
        },
        summary: `route built, confidence ${built.confidence}`,
      }
    },
  }

  return {
    tools: TOOL_DEFINITIONS,
    pool,
    trace,
    get finalRoute() {
      return finalRoute
    },
    requestedTagIds,
    async dispatch(name, args) {
      const handler = handlers[name]
      if (!handler) throw new Error(`Unknown tool: ${name}`)
      const started = Date.now()
      const { result, summary } = await handler(args)
      trace.push({
        at: new Date().toISOString(),
        tool: name,
        argsSummary: JSON.stringify(args).slice(0, 200),
        resultSummary: summary,
        ms: Date.now() - started,
      })
      return result
    },
  }
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/tools.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent/budget.ts src/lib/agent/tools.ts src/lib/agent/budget.test.ts src/lib/agent/tools.test.ts
git commit -m "feat(agent): define four Qloo tools and a round budget, with ordering kept in our code"
```

---

### Task 12: The agent loop

**Files:**
- Create: `src/lib/agent/loop.ts`
- Test: `src/lib/agent/loop.test.ts`

**Interfaces:**
- Consumes: `createSession`, `Budget`, `serverEnv`.
- Produces: `planRoute(opts: PlanOptions): Promise<PlanResult>`; `type PlanResult = { route: Route; roundsUsed: number } | { error: string; trace: TraceEntry[] }`; `SYSTEM_PROMPT`.

- [ ] **Step 1: Write the failing test with a stubbed chat client**

`src/lib/agent/loop.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FixtureProvider } from '../providers/fixture'
import { planRoute, type ChatClient } from './loop'
import type { RouteRequest } from '../providers/types'

const request: RouteRequest = {
  city: 'Lagos',
  mood: 'low-key but not dead',
  timeWindow: { startHour: 18, endHour: 23 },
}

/** Replays a fixed script of assistant turns, ignoring the messages sent. */
const scriptedClient = (script: { calls: { name: string; args: object }[] }[]): ChatClient => {
  let turn = 0
  return {
    async complete() {
      const step = script[turn++]
      if (!step) return { toolCalls: [] }
      return {
        toolCalls: step.calls.map((c, i) => ({
          id: `call_${turn}_${i}`,
          name: c.name,
          arguments: JSON.stringify(c.args),
        })),
      }
    },
  }
}

const run = (client: ChatClient, maxRounds = 6) =>
  planRoute({
    provider: new FixtureProvider(),
    request,
    locality: { name: 'Lagos' },
    client,
    maxRounds,
  })

describe('planRoute', () => {
  it('returns a route when the agent gathers then finalizes', async () => {
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.roundsUsed).toBe(2)
  })

  it('force-finalizes when the budget runs out', async () => {
    const neverFinalizes = scriptedClient(
      Array.from({ length: 10 }, () => ({ calls: [{ name: 'suggest_places', args: {} }] })),
    )
    const result = await run(neverFinalizes, 2)
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
    expect(result.roundsUsed).toBe(2)
  })

  it('force-finalizes when the model stops calling tools without finalizing', async () => {
    const result = await run(scriptedClient([{ calls: [{ name: 'suggest_places', args: {} }] }]))
    if ('error' in result) throw new Error(result.error)
    expect(result.route.stops).toHaveLength(3)
  })

  it('returns an error rather than a route when the pool cannot fill three slots', async () => {
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'suggest_places', args: { tagIds: ['urn:tag:genre:place:cafe'] } }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toMatch(/close/)
    expect(result.trace.length).toBeGreaterThan(0)
  })

  it('surfaces the unknown-city message when the provider rejects the locality', async () => {
    const failing = {
      kind: 'qloo' as const,
      async findTags() {
        return []
      },
      async seedEntities() {
        return []
      },
      async suggestPlaces(): Promise<never> {
        const { UnknownLocalityError } = await import('../providers/qloo')
        throw new UnknownLocalityError('Nowhereville')
      },
    }
    const result = await planRoute({
      provider: failing,
      request: { ...request, city: 'Nowhereville' },
      locality: { name: 'Nowhereville' },
      client: scriptedClient([{ calls: [{ name: 'suggest_places', args: {} }] }]),
      maxRounds: 3,
    })
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toContain('Nowhereville')
  })

  it('attaches the trace to the returned route', async () => {
    const result = await run(
      scriptedClient([
        { calls: [{ name: 'find_tags', args: { query: 'cocktail' } }] },
        { calls: [{ name: 'suggest_places', args: {} }] },
        { calls: [{ name: 'finalize_route', args: {} }] },
      ]),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.route.trace.map((t) => t.tool)).toEqual([
      'find_tags',
      'suggest_places',
      'finalize_route',
    ])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/agent/loop.test.ts`
Expected: FAIL — cannot resolve `./loop`.

- [ ] **Step 3: Write `src/lib/agent/loop.ts`**

`ChatClient` is a two-method seam so the loop is testable without a network call or an API key.

```ts
import { Budget, DEFAULT_MAX_ROUNDS } from './budget'
import { createSession } from './tools'
import { UnknownLocalityError } from '../providers/qloo'
import type { Locality, Route, RouteRequest, TasteProvider, TraceEntry } from '../providers/types'
import type { ToolDefinition } from './tools'

export const SYSTEM_PROMPT = `You plan a three-stop evening out using Qloo's taste graph.

How to work:
1. Call find_tags to turn the user's mood into real Qloo tag ids. Mood phrases usually
   have several parts: resolve each one separately.
2. If the user names a place they already like, call seed_entities. Seeding with
   entities is the only way Qloo returns explainability, which makes the reasons better.
3. Call suggest_places with the tag ids you found. Read the assessment it returns.
   If the confidence is weak, call suggest_places again with broader or different tags
   before giving up. Aim for at least three options per slot.
4. Call finalize_route when the pool is good enough.

What you do not do: you never choose, score or order the stops, and you never write the
reasons. TasteRoute does that from Qloo's own data. Your job is to ask Qloo the right
questions. Do not invent place names, tag ids or entity ids: only use ids that a tool
returned to you.`

export type ChatToolCall = { id: string; name: string; arguments: string }

export type ChatClient = {
  complete(input: {
    system: string
    messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }[]
    tools: ToolDefinition[]
  }): Promise<{ toolCalls: ChatToolCall[] }>
}

export type PlanOptions = {
  provider: TasteProvider
  request: RouteRequest
  locality: Locality
  client: ChatClient
  maxRounds?: number
}

export type PlanResult =
  | { route: Route; roundsUsed: number }
  | { error: string; trace: TraceEntry[] }

export async function planRoute(opts: PlanOptions): Promise<PlanResult> {
  const { provider, request, locality, client } = opts
  const budget = new Budget(opts.maxRounds ?? DEFAULT_MAX_ROUNDS)
  const session = createSession({ provider, request, locality })

  const messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }[] = [
    {
      role: 'user',
      content: `City: ${request.city}\nMood: ${request.mood}\nOut between ${request.timeWindow.startHour}:00 and ${request.timeWindow.endHour}:00.`,
    },
  ]

  let lastFinalizeFailure: string | null = null

  while (budget.consumeRound()) {
    let toolCalls: ChatToolCall[]
    try {
      const turn = await client.complete({ system: SYSTEM_PROMPT, messages, tools: session.tools })
      toolCalls = turn.toolCalls
    } catch (e) {
      return { error: `The planner could not be reached: ${(e as Error).message}`, trace: session.trace }
    }

    if (toolCalls.length === 0) break

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {}
      } catch {
        args = {}
      }

      let result: unknown
      try {
        result = await session.dispatch(call.name, args)
      } catch (e) {
        if (e instanceof UnknownLocalityError) {
          return { error: e.message, trace: session.trace }
        }
        result = { error: (e as Error).message }
      }

      if (call.name === 'finalize_route') {
        const r = result as { ok?: boolean; reason?: string }
        if (r.ok === false && r.reason) lastFinalizeFailure = r.reason
      }

      messages.push({ role: 'tool', content: JSON.stringify(result).slice(0, 4000), toolCallId: call.id })
    }

    if (session.finalRoute) break
  }

  // The model may stop early or run out of rounds. Build from whatever was gathered.
  if (!session.finalRoute) {
    const forced = (await session.dispatch('finalize_route', {})) as {
      ok?: boolean
      reason?: string
    }
    if (forced.ok === false && forced.reason) lastFinalizeFailure = forced.reason
  }

  const route = session.finalRoute
  if (!route) {
    return {
      error: lastFinalizeFailure ?? 'Not enough places came back to build a three-stop route.',
      trace: session.trace,
    }
  }

  return { route: { ...route, trace: session.trace }, roundsUsed: budget.roundsUsed }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/loop.test.ts`
Expected: PASS, 6 tests.

Note: the force-finalize path consumes no budget round, so `roundsUsed` stays at the cap in the budget-exhaustion test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/loop.ts src/lib/agent/loop.test.ts
git commit -m "feat(agent): add bounded agent loop with forced finalize and testable chat seam"
```

---

### Task 13: OpenAI-backed chat client and the API route

**Files:**
- Create: `src/lib/agent/openai-client.ts`
- Create: `src/app/api/route/route.ts`
- Test: `src/lib/agent/openai-client.test.ts`

**Interfaces:**
- Consumes: `ChatClient`, `ToolDefinition`, `serverEnv`, `hasModelAccess`, `planRoute`, `QlooProvider`, `FixtureProvider`.
- Produces: `createOpenAIClient(): ChatClient`; `POST` handler at `/api/route` accepting `{ city, mood, startHour, endHour }` and returning `{ route }` or `{ error }`.

- [ ] **Step 1: Write the failing client test**

`src/lib/agent/openai-client.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { toChatClient } from './openai-client'

describe('toChatClient', () => {
  it('maps OpenAI tool calls onto our ChatToolCall shape', async () => {
    const create = vi.fn(async () => ({
      choices: [
        {
          message: {
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'find_tags', arguments: '{"query":"cocktail"}' } },
            ],
          },
        },
      ],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'openai/gpt-5-mini')
    const out = await client.complete({ system: 'sys', messages: [], tools: [] })
    expect(out.toolCalls).toEqual([
      { id: 'call_1', name: 'find_tags', arguments: '{"query":"cocktail"}' },
    ])
  })

  it('returns no tool calls when the model replies with prose', async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: 'done' } }] }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'openai/gpt-5-mini')
    expect((await client.complete({ system: 's', messages: [], tools: [] })).toolCalls).toEqual([])
  })

  it('puts the system prompt first and passes the model through', async () => {
    const create = vi.fn(async () => ({ choices: [{ message: {} }] }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'openai/gpt-5-nano')
    await client.complete({
      system: 'SYS',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    })
    const arg = create.mock.calls[0][0] as { model: string; messages: { role: string; content: string }[] }
    expect(arg.model).toBe('openai/gpt-5-nano')
    expect(arg.messages[0]).toEqual({ role: 'system', content: 'SYS' })
  })

  it('sends tool results with their tool_call_id', async () => {
    const create = vi.fn(async () => ({ choices: [{ message: {} }] }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'm')
    await client.complete({
      system: 's',
      messages: [{ role: 'tool', content: '{"ok":true}', toolCallId: 'call_9' }],
      tools: [],
    })
    const arg = create.mock.calls[0][0] as { messages: Record<string, unknown>[] }
    expect(arg.messages[1]).toMatchObject({ role: 'tool', tool_call_id: 'call_9' })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/agent/openai-client.test.ts`
Expected: FAIL — cannot resolve `./openai-client`.

- [ ] **Step 3: Write `src/lib/agent/openai-client.ts`**

`toChatClient` takes an already-built SDK instance so the test needs no key; `createOpenAIClient` is the thin production wrapper.

```ts
import OpenAI from 'openai'
import { serverEnv } from '../env'
import type { ChatClient } from './loop'

type MinimalOpenAI = {
  chat: {
    completions: {
      create(body: Record<string, unknown>): Promise<{
        choices?: {
          message?: {
            content?: string | null
            tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[]
          }
        }[]
      }>
    }
  }
}

export function toChatClient(sdk: MinimalOpenAI, model: string): ChatClient {
  return {
    async complete({ system, messages, tools }) {
      const body = {
        model,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) =>
            m.role === 'tool'
              ? { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId }
              : { role: m.role, content: m.content },
          ),
        ],
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      }

      const res = await sdk.chat.completions.create(body)
      const calls = res.choices?.[0]?.message?.tool_calls ?? []
      return {
        toolCalls: calls.map((c) => ({
          id: c.id,
          name: c.function?.name ?? '',
          arguments: c.function?.arguments ?? '{}',
        })),
      }
    },
  }
}

export function createOpenAIClient(): ChatClient {
  const env = serverEnv()
  const sdk = new OpenAI({
    apiKey: env.modelApiKey,
    ...(env.modelBaseUrl ? { baseURL: env.modelBaseUrl } : {}),
  })
  return toChatClient(sdk as unknown as MinimalOpenAI, env.model)
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/agent/openai-client.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `src/app/api/route/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createOpenAIClient } from '@/lib/agent/openai-client'
import { planRoute } from '@/lib/agent/loop'
import { hasModelAccess } from '@/lib/env'
import { FixtureProvider } from '@/lib/providers/fixture'
import { QlooProvider } from '@/lib/providers/qloo'

export const runtime = 'nodejs'
export const maxDuration = 60

const bodySchema = z.object({
  city: z.string().min(1).max(80),
  mood: z.string().min(1).max(200),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
})

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Tell us a city and a mood to work from.' }, { status: 400 })
  }

  const useFixtures = !hasModelAccess() || !process.env.QLOO_API_KEY
  const provider = useFixtures ? new FixtureProvider() : new QlooProvider()

  if (useFixtures) {
    // No credentials in this environment: serve a labelled fixture route rather than an error.
    const { buildRoute } = await import('@/lib/route/build')
    const { candidates } = await provider.suggestPlaces({ locality: parsed.city })
    const built = buildRoute({
      candidates,
      request: {
        city: parsed.city,
        mood: parsed.mood,
        timeWindow: { startHour: parsed.startHour, endHour: parsed.endHour },
      },
      locality: { name: parsed.city },
      requestedTagIds: [],
      explainability: null,
      seedNames: {},
      trace: [],
      providerKind: 'fixture',
    })
    if ('error' in built) return NextResponse.json({ error: built.reason }, { status: 422 })
    return NextResponse.json({ route: built })
  }

  const result = await planRoute({
    provider,
    request: {
      city: parsed.city,
      mood: parsed.mood,
      timeWindow: { startHour: parsed.startHour, endHour: parsed.endHour },
    },
    locality: { name: parsed.city },
    client: createOpenAIClient(),
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error, trace: result.trace }, { status: 422 })
  }
  return NextResponse.json({ route: result.route, roundsUsed: result.roundsUsed })
}
```

- [ ] **Step 6: Verify the route end to end against live Qloo and the model**

```bash
cd ~/Techclave/tasteroute
set -a && . ./.env.local && set +a
npm run dev &
sleep 8
curl -s -X POST localhost:3000/api/route \
  -H 'content-type: application/json' \
  -d '{"city":"Lagos","mood":"low-key but not dead","startHour":18,"endHour":23}' \
  | python3 -m json.tool | head -40
kill %1
```
Expected: three stops with names and reasons, plus `roundsUsed`. If `error` names a city, the locality path is working; if it names rounds, raise the cap.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/openai-client.ts src/lib/agent/openai-client.test.ts src/app/api/route/route.ts
git commit -m "feat(api): wire the agent loop to OpenAI and expose POST /api/route"
```

---

### Task 14: The interface

**Files:**
- Create: `src/components/MoodForm.tsx`, `src/components/StopCard.tsx`, `src/components/RouteView.tsx`, `src/components/TracePanel.tsx`, `src/components/ProviderBanner.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `Route`, `Stop`, `Evidence`, `TraceEntry` types; `POST /api/route`.
- Produces: a working mobile-first page. No new exported logic.

- [ ] **Step 1: Write `src/components/ProviderBanner.tsx`**

The fixture disclosure. Never silent.

```tsx
export function ProviderBanner({ kind }: { kind: 'qloo' | 'fixture' }) {
  if (kind === 'qloo') {
    return (
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Live data from Qloo&apos;s Taste AI.
      </p>
    )
  }
  return (
    <p
      className="rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
    >
      <strong>Sample data.</strong> This route was built from built-in example places, not a
      live Qloo query.
    </p>
  )
}
```

- [ ] **Step 2: Write `src/components/StopCard.tsx`**

```tsx
import type { Stop } from '@/lib/providers/types'

const SLOT_LABEL: Record<Stop['slot'], string> = {
  open: 'Start',
  main: 'Main',
  close: 'Finish',
}

export function StopCard({ stop }: { stop: Stop }) {
  return (
    <li
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      {stop.walkFromPrev && (
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          {stop.walkFromPrev.minutes} min walk · {stop.walkFromPrev.metres} m
        </p>
      )}
      <div className="flex items-baseline gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: 'var(--accent)', color: '#0a0a0a' }}
        >
          {SLOT_LABEL[stop.slot]}
        </span>
        <h3 className="text-lg font-semibold">{stop.candidate.name}</h3>
      </div>

      {stop.candidate.address && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {stop.candidate.address}
        </p>
      )}

      <p className="mt-3 text-sm">{stop.why}</p>

      {stop.evidence.length === 0 ? (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--muted)' }}>
          Qloo returned no taste signal for this place.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {stop.evidence.map((e, i) => (
            <li
              key={i}
              className="rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              {e.kind}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
```

- [ ] **Step 3: Write `src/components/TracePanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { TraceEntry } from '@/lib/providers/types'

export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const [open, setOpen] = useState(false)
  if (trace.length === 0) return null

  return (
    <section className="mt-8">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs underline"
        style={{ color: 'var(--muted)' }}
      >
        {open ? 'Hide' : 'Show'} how this was planned ({trace.length} steps)
      </button>

      {open && (
        <ol className="mt-3 space-y-2">
          {trace.map((t, i) => (
            <li
              key={i}
              className="rounded border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <div className="flex justify-between gap-3">
                <code style={{ color: 'var(--accent)' }}>{t.tool}</code>
                <span style={{ color: 'var(--muted)' }}>{t.ms} ms</span>
              </div>
              <p className="mt-1" style={{ color: 'var(--muted)' }}>
                {t.resultSummary}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Write `src/components/RouteView.tsx`**

```tsx
import type { Route } from '@/lib/providers/types'
import { ProviderBanner } from './ProviderBanner'
import { StopCard } from './StopCard'
import { TracePanel } from './TracePanel'

const CONFIDENCE_NOTE: Record<Route['confidence'], string | null> = {
  strong: null,
  ok: 'Choice was thin in places, so one stop may be a stretch.',
  weak: 'Qloo returned little to work with here. Treat this as a guess, and see the alternatives below.',
}

export function RouteView({ route }: { route: Route }) {
  const note = CONFIDENCE_NOTE[route.confidence]

  return (
    <section className="mt-8">
      <ProviderBanner kind={route.providerKind} />

      {note && (
        <p
          className="mt-3 rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: '#854d0e', background: '#1c1405', color: '#fde68a' }}
        >
          {note}
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {route.stops.map((s) => (
          <StopCard key={s.candidate.id} stop={s} />
        ))}
      </ol>

      {route.alternatives.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold">Other options Qloo returned</h4>
          <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
            {route.alternatives.map((c) => (
              <li key={c.id}>
                {c.name}
                {c.category ? ` — ${c.category.replace(/_/g, ' ')}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TracePanel trace={route.trace} />
    </section>
  )
}
```

- [ ] **Step 5: Write `src/components/MoodForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { Route } from '@/lib/providers/types'

const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Nairobi', 'Accra']

export function MoodForm({ onRoute }: { onRoute: (r: Route) => void }) {
  const [city, setCity] = useState('Lagos')
  const [mood, setMood] = useState('')
  const [startHour, setStartHour] = useState(18)
  const [endHour, setEndHour] = useState(23)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city, mood, startHour, endHour }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong planning that route.')
        return
      }
      onRoute(data.route as Route)
    } catch {
      setError('Could not reach the planner. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const field = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
    color: 'var(--fg)',
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          City
        </span>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
          style={field}
        >
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          What kind of evening?
        </span>
        <input
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          required
          maxLength={200}
          placeholder="low-key but not dead, somewhere with live music"
          className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
          style={field}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            From
          </span>
          <input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
            style={field}
          />
        </label>
        <label className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Until
          </span>
          <input
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(e) => setEndHour(Number(e.target.value))}
            className="mt-1 w-full rounded-md border px-3 py-2.5 text-base"
            style={field}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md px-4 py-3 text-base font-semibold disabled:opacity-60"
        style={{ background: 'var(--accent)', color: '#0a0a0a' }}
      >
        {busy ? 'Planning…' : 'Plan my evening'}
      </button>

      {error && (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#7f1d1d', background: '#1c0505', color: '#fca5a5' }}
        >
          {error}
        </p>
      )}
    </form>
  )
}
```

- [ ] **Step 6: Replace `src/app/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { MoodForm } from '@/components/MoodForm'
import { RouteView } from '@/components/RouteView'
import type { Route } from '@/lib/providers/types'

export default function Home() {
  const [route, setRoute] = useState<Route | null>(null)

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">TasteRoute</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
        Say the mood. Get three stops, in order, with the reason for each one.
      </p>

      <MoodForm onRoute={setRoute} />
      {route && <RouteView route={route} />}

      <footer className="mt-12 text-xs" style={{ color: 'var(--muted)' }}>
        Built by TechClave. Taste data from Qloo.
      </footer>
    </main>
  )
}
```

- [ ] **Step 7: Verify build, types and a phone viewport**

```bash
cd ~/Techclave/tasteroute
npm run typecheck && npm test && npm run build
```
Expected: all clean. Then run `npm run dev`, open at 390px wide, and check there is no horizontal scroll and the button is reachable with a thumb.

- [ ] **Step 8: Commit and deploy**

```bash
git add src/components src/app/page.tsx
git commit -m "feat(ui): add mobile-first mood form, route view and planner trace panel"
npx --yes vercel@latest deploy --prod --yes
```

---

### Task 15: Save and share

Covers **Review Focus 5** — a tampered share link must fail cleanly.

**Files:**
- Create: `src/lib/share/encode.ts`
- Test: `src/lib/share/encode.test.ts`
- Modify: `src/components/RouteView.tsx` (add the share button), `src/app/page.tsx` (read `?r=` on load)

**Interfaces:**
- Consumes: `Route`.
- Produces: `encodeRoute(r: Route): string`; `decodeRoute(s: string): Route | null`; `saveRoute(r: Route): void`; `listSavedRoutes(): Route[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/share/encode.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIXTURE_CANDIDATES } from '../providers/fixture'
import { buildRoute } from '../route/build'
import { decodeRoute, encodeRoute } from './encode'
import type { Route } from '../providers/types'

const route = (): Route => {
  const r = buildRoute({
    candidates: FIXTURE_CANDIDATES,
    request: { city: 'Lagos', mood: 'low-key', timeWindow: { startHour: 18, endHour: 23 } },
    locality: { name: 'Lagos' },
    requestedTagIds: [],
    explainability: null,
    seedNames: {},
    trace: [],
    providerKind: 'fixture',
  })
  if ('error' in r) throw new Error('fixture route should build')
  return r
}

describe('encodeRoute / decodeRoute', () => {
  it('round-trips a route', () => {
    const r = route()
    const back = decodeRoute(encodeRoute(r))
    expect(back?.stops.map((s) => s.candidate.name)).toEqual(r.stops.map((s) => s.candidate.name))
    expect(back?.mood).toBe(r.mood)
    expect(back?.providerKind).toBe(r.providerKind)
  })

  it('produces a url-safe string with no padding', () => {
    expect(encodeRoute(route())).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('returns null for a truncated string rather than throwing', () => {
    const half = encodeRoute(route()).slice(0, 20)
    expect(decodeRoute(half)).toBeNull()
  })

  it('returns null for arbitrary junk', () => {
    expect(decodeRoute('not-a-route-at-all')).toBeNull()
    expect(decodeRoute('')).toBeNull()
  })

  it('returns null for valid base64 that is not a route', () => {
    const notARoute = Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64url')
    expect(decodeRoute(notARoute)).toBeNull()
  })

  it('returns null for a route with the wrong number of stops', () => {
    const r = route()
    const tampered = { ...r, stops: [r.stops[0]] }
    const encoded = Buffer.from(JSON.stringify(tampered)).toString('base64url')
    expect(decodeRoute(encoded)).toBeNull()
  })

  it('drops the trace from the shared payload to keep the link short', () => {
    const r = { ...route(), trace: [{ at: 'now', tool: 'x', argsSummary: 'a', resultSummary: 'b', ms: 1 }] }
    expect(decodeRoute(encodeRoute(r))?.trace).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/share/encode.test.ts`
Expected: FAIL — cannot resolve `./encode`.

- [ ] **Step 3: Write `src/lib/share/encode.ts`**

A Zod shape check is what turns "valid base64 but not a route" into a clean null.

```ts
import { z } from 'zod'
import type { Route } from '../providers/types'

const STORAGE_KEY = 'tasteroute.saved.v1'

const stopShape = z.object({
  order: z.number(),
  slot: z.enum(['open', 'main', 'close']),
  candidate: z.object({ id: z.string(), name: z.string() }).loose(),
  why: z.string(),
  evidence: z.array(z.object({ kind: z.string(), label: z.string() }).loose()),
})

const routeShape = z.object({
  id: z.string(),
  locality: z.object({ name: z.string() }).loose(),
  mood: z.string(),
  createdAt: z.string(),
  stops: z.tuple([stopShape, stopShape, stopShape]),
  confidence: z.enum(['strong', 'ok', 'weak']),
  providerKind: z.enum(['qloo', 'fixture']),
})

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    if (typeof atob === 'function') {
      const binary = atob(padded)
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export function encodeRoute(route: Route): string {
  // The trace can be long and is not part of what gets shared.
  const { trace: _trace, ...rest } = route
  return toBase64Url(JSON.stringify({ ...rest, trace: [] }))
}

export function decodeRoute(encoded: string): Route | null {
  if (!encoded) return null
  const json = fromBase64Url(encoded)
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  const check = routeShape.safeParse(parsed)
  if (!check.success) return null

  const route = parsed as Route
  return { ...route, trace: [], alternatives: route.alternatives ?? [], unfilledSlots: route.unfilledSlots ?? [] }
}

export function saveRoute(route: Route): void {
  try {
    const existing = listSavedRoutes().filter((r) => r.id !== route.id)
    const next = [{ ...route, trace: [] }, ...existing].slice(0, 20)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private browsing or blocked storage: saving is a convenience, not a requirement.
  }
}

export function listSavedRoutes(): Route[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Route[]) : []
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/share/encode.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the share and save controls to `src/components/RouteView.tsx`**

Convert the component to a client component and add this block directly above `<TracePanel …>`:

```tsx
'use client'

// …existing imports…
import { encodeRoute, saveRoute } from '@/lib/share/encode'
```

```tsx
      <div className="mt-6 flex gap-2">
        <button
          onClick={() => {
            const url = `${window.location.origin}/?r=${encodeRoute(route)}`
            navigator.clipboard?.writeText(url)
          }}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Copy share link
        </button>
        <button
          onClick={() => saveRoute(route)}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Save this route
        </button>
      </div>
```

- [ ] **Step 6: Read `?r=` on load in `src/app/page.tsx`**

Add inside the `Home` component, after the `useState`:

```tsx
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get('r')
    if (!encoded) return
    const decoded = decodeRoute(encoded)
    if (decoded) setRoute(decoded)
    else setLinkError('That shared link is not readable. Plan a new route instead.')
  }, [])
```

Import `useEffect` and `decodeRoute`, and render `linkError` above `<MoodForm …>` using the same red style as the form error.

- [ ] **Step 7: Verify and commit**

```bash
cd ~/Techclave/tasteroute
npm run typecheck && npm test && npm run build
git add src/lib/share src/components/RouteView.tsx src/app/page.tsx
git commit -m "feat(share): add save to localStorage and a share link that fails safe"
```

---

### Task 16: Submission package

**Files:**
- Modify: `README.md`, `STATUS.md`
- Create: `docs/submission.md`

**Interfaces:**
- Consumes: the deployed URL from Task 1 and 14.
- Produces: everything Devpost requires.

- [ ] **Step 1: Write `README.md`**

````markdown
# TasteRoute

Say the mood. Get three stops, in order, with the reason for each one.

TasteRoute turns a mood and a city into a three-stop evening out. An agent decides
which questions to ask [Qloo's Taste AI](https://qloo.com), and TasteRoute decides
what the answer is: scoring, stop order and the reason text are all computed from
Qloo's own fields, never generated.

**Live demo:** <URL>

## What makes it Qloo-powered

Remove Qloo and nothing works. Specifically:

- **Mood becomes real taste tags.** The agent calls `/v2/tags` to turn "low-key but
  not dead" into actual Qloo tag URNs such as
  `urn:tag:genre:place:restaurant:cocktail_bar`. There is no hardcoded mood table.
- **Candidates come from `/v2/insights`** with those tags as taste signals, scoped
  to the city's locality.
- **Every reason cites a Qloo field.** Matched tag names, the `affinity` score,
  `good_for` and `ambience_description`, and Qloo's own `explainability` block when
  the query was seeded with entities. A stop with no Qloo signal is labelled as
  unexplained rather than given an invented rationale.
- **Weak signal is reported, not hidden.** When Qloo returns too little, the route
  says so and offers alternatives.

## How the agent is bounded

The agent chooses which mood words to resolve, which tags to pursue, whether to widen
the search, and when to stop. It cannot choose, score or order the stops, and it does
not write the reasons — those are pure functions with unit tests. The planner trace is
visible in the UI, so you can see every tool call it made.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm test                     # engine tests, no network needed
npm run dev
```

Environment variables are listed in `.env.example`. A Qloo hackathon key is required
for live data; without one the app serves clearly labelled sample routes.

## Tests

```bash
npm test          # unit tests
npm run typecheck
```

The live Qloo smoke test runs only when `QLOO_API_KEY` is set.

## Licence

MIT. See [LICENSE](./LICENSE).
````

- [ ] **Step 2: Update `STATUS.md`**

Record: the hosted URL, the commands, decisions taken and why, the remaining submission steps, and the known gaps. Include that `feature.explainability` only works with entity signals, since that is the finding most likely to be forgotten.

- [ ] **Step 3: Write `docs/submission.md`**

The Devpost text description, ready to paste: what it does, what makes it Qloo-powered, the bounded-agent design, and the repo and demo links.

- [ ] **Step 4: Final verification**

```bash
cd ~/Techclave/tasteroute
npm test && npm run typecheck && npm run build
git log --oneline | head -20
git ls-files | grep -E '\.env' || echo "no env files tracked — good"
```
Expected: clean, and no `.env*` file tracked except `.env.example`.

- [ ] **Step 5: Hand over for the public push**

Do not push to a public remote without Christopher's go-ahead. Report: the repo is ready, the licence is in place, and the About section needs the licence visible once the remote exists.

- [ ] **Step 6: Commit**

```bash
git add README.md STATUS.md docs/submission.md
git commit -m "docs: add README, submission text and status for Devpost"
```

---

## Self-review notes

**Spec coverage:** every spec section maps to a task — data contract (2), fixtures (3), slots/scoring/ordering/evidence/assessment (4–8), composition (9), Qloo adapter (10), budget and agent (11–12), API (13), UI (14), save/share (15), submission (16). The spec's security table is enforced in Tasks 1, 10, 11 and 16.

**Known deviations from the spec, deliberate:**
- The spec's scoring section lists `slotFit` at 0.20 and no popularity term; this plan uses 0.15 slot plus 0.05 popularity so that a candidate with no affinity and no tags still has a tiebreak. Same five-term structure, weights sum to 1.
- The spec says main-slot ordering is chosen by distance; this plan fixes `close` last and fills `main` first, because the anchor of the evening should get the best of the pool.
- `buildRoute` returns a discriminated failure rather than a `Route` with fewer than three stops, which is what makes Review Focus 4 expressible in the type system.
