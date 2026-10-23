# TasteRoute — design spec

**Date:** 23 October 2026
**Owner:** Christopher Emeka (TechClave)
**Status:** awaiting review
**Submission deadline:** 30 October 2026, 11:45pm EDT (Qloo Agentic Hackathon, Devpost)

---

## 1. What this is and why

TasteRoute turns a mood and a city into a three-stop outing you can actually
follow, where every stop carries a visible reason drawn from real taste data
rather than a model's guess.

The product claim is narrow on purpose. A generic assistant asked "where should
I go out tonight in Lagos?" produces plausible-sounding names with no
grounding, no ordering logic, and no way to tell a good answer from a confident
one. TasteRoute grounds each suggestion in Qloo's taste graph, orders the stops
itself, and shows its working — including when the signal is weak.

This is a TechClave product that happens to have a hackathon as its first
deadline. The hackathon shapes the schedule, not the architecture: anything
built to win and then thrown away is the wrong thing to build.

### Who it is for

Someone new to a city, or newly bored of their own, who wants an evening
planned without reading forty reviews. The UrbanEx deck (Belsoft Systems,
privileged and confidential) framed this audience well and is the inspiration
for the product category. **Nothing from that deck — text, branding, feature
names, or the UrbanEx name — appears in this repo or product.** The audience
insight is the only thing carried across.

### Success criteria

1. A judge opens the hosted demo, picks a city and a mood, and gets a three-stop
   route with per-stop reasons inside ten seconds.
2. Every reason shown traces to a Qloo field. None is generated from nothing.
3. When Qloo returns thin results, the app says so rather than bluffing.
4. Remove Qloo and the product stops working. That is the test the hackathon
   rules set, and it should be true of the real product too.

## 2. Non-goals

- Live events, concerts, ticketing.
- SafeCall, distress calls, emergency features, location monitoring. These are
  UrbanEx's ideas and carry duty-of-care obligations TechClave is not taking on.
- Gamification, badges, challenges, social graph, user accounts.
- Booking, payments, affiliate links.
- More than three stops. Three is the product.
- Any persistent server-side store. Saved routes live in the browser.

## 3. Hackathon constraints, as verified

Read from the Devpost rules page on 23 Oct 2026:

| Requirement | Detail |
|---|---|
| Deadline | 30 Oct 2026, 11:45pm EDT |
| Agentic | Must function as an agentic tool, use an agent framework, or wire Qloo into an agent. "If your submission would work the same without Qloo, you're building the wrong thing." |
| Hosted demo | Must be externally hosted and publicly usable end-to-end. Local-only submissions are disqualified. |
| Public repo | All source, assets, run instructions. |
| Licence | Open-source licence file, visible in the repo's About section. |
| Written description | What it does and what makes it Qloo-powered. |
| Demo video | **Not required.** Devpost removed it. |

Judging: Technological Implementation, Design, Potential Impact, Quality of the
Idea. Design is explicitly "a complete, coherent product experience, not just a
technical proof of concept."

### What this costs us

Seven days. The hosted demo requirement means deployment happens on day one
against fixtures, not on day six against a finished app. A submission that is
excellent locally and unreachable publicly scores zero.

## 4. Verified Qloo API facts

All confirmed by live request against `https://hackathon.api.qloo.com` on
23 Oct 2026. These are facts, not assumptions.

**Auth:** `X-Api-Key` header. Not a query parameter, not a Bearer token.
Hackathon keys return 401 against staging and production hosts.

**Allowed endpoints:** `/search`, `/v2/insights`, `/v2/tags`.
`/recs` and `/recommendations` are legacy and return 403.

**Place coverage** (`filter.type=urn:entity:place`, `filter.location.query=<city>`,
`take=50`): Lagos, Abuja, Port Harcourt, Nairobi and Accra each returned the
full 50. Coverage is not a risk for Nigerian cities.

**Place entity shape:** `entity_id`, `name`, `type`, `subtype`, `location`,
`popularity`, `tags[]`, `properties{}`, `external{}`, `references{}`,
`disambiguation`, and `query{affinity, distance, measurements}`.

Useful `properties` fields observed: `address`, `geocode`, `hours`,
`business_rating`, `good_for`, `keywords`, `ambience_description`,
`cuisine_description`, `cost_description`, `live_music`, `amenities_description`,
`is_closed`, `images`.

**Tag taxonomy** (`/v2/tags?filter.query=cocktail`) returns real URNs with
`popularity` scores:
- `urn:tag:genre:place:restaurant:cocktail_bar`
- `urn:tag:offerings:place:cocktails`
- `urn:tag:specialty_dish:place:cocktail`

**Explainability is conditional.** `feature.explainability=true` with
`signal.interests.tags` returns `warnings: [{type: "Could not calculate
explainability"}]` and no explainability block. The same flag with
`signal.interests.entities` returns `query.explainability` populated with
`effect_on_top3_recs`, `effect_on_top5_recs`, `effect_on_top10_recs` and
`effect_on_all_recs`, each listing per-signal `avg_score`.

This single finding drives the evidence design in section 8.

**The dangerous gotcha:** the hackathon host *silently ignores invalid
parameters* rather than erroring. A typo in a filter name produces a 200 and a
query that quietly did something else. We therefore validate every outbound
parameter name against an allowlist in our own code, and test that a bad
parameter is rejected by us before it ever reaches Qloo.

**Supported `filter.type` values:** artist, book, brand, destination, movie,
person, place, podcast, tv_show, video_game. Others return 403.

**Rate limits:** not numerically documented. Described as set high enough for
typical projects.

## 5. Architecture

Three layers with one rule between them: the model decides *what to ask*, our
code decides *what the answer is*.

```
┌─ UI (Next.js, mobile-first) ──────────────────────────────┐
│  mood + city + time window  →  route + per-stop reasons   │
│  live agent trace panel (every tool call, visible)        │
└───────────────────────────┬───────────────────────────────┘
                            │  server action / route handler
┌───────────────────────────▼───────────────────────────────┐
│  Agent loop (OpenAI, server-side only)                    │
│  plans the outing by calling tools; narrates as it goes   │
└───────────────────────────┬───────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ Qloo tools    │  │ route engine    │  │ signal assessor  │
│ (adapter)     │  │ (deterministic, │  │ (deterministic)  │
│ find_tags     │  │  ours, tested)  │  │  weak/ok/strong  │
│ seed_entities │  │ score_and_order │  └──────────────────┘
│ suggest_places│  └─────────────────┘
└───────┬───────┘
        ▼
  TasteProvider interface  ──→  QlooProvider | FixtureProvider
```

### Why an agent, and why a constrained one

The hackathon requires agentic behaviour. But handing route construction to a
language model would give up the thing that makes TasteRoute a product: a
defensible, testable, repeatable ordering. So the agent's authority is bounded.

The agent decides: which mood words to turn into tag queries, which tags to
pursue, whether to seed with entities, when results are too thin to accept, and
whether to re-query differently.

The agent does not decide: the score of a candidate, the order of the stops, or
the text of a reason. Those are pure functions in `src/lib/route/`.

This is not a compromise between the two requirements. It is the better design
on its own terms — the agent handles the part that genuinely needs judgment
(interpreting "something low-key but not dead") and our code handles the part
that must never vary between runs.

### Why the trace panel is a feature, not debug output

Showing every tool call and its result does three jobs at once. It is the
"supervised" half of the product promise. It is the clearest possible evidence
to a judge that the thing is genuinely agentic and genuinely Qloo-powered. And
it is how a user decides whether to trust a route they did not build.

### Runtime

| Concern | Choice | Note |
|---|---|---|
| Framework | Next.js App Router, TypeScript | server routes keep both API keys off the client |
| Styling | Tailwind, mobile-first single column | judges will open it on a phone |
| Agent | `openai` npm SDK, function tools, own loop | pin `7.32.0` (9 Oct) — settled, not yesterday's `7.43.0` |
| Model access | OpenAI SDK with `baseURL` set to OpenRouter | TechClave's own OpenAI key is dead (401); the OpenRouter key works (200) and is OpenAI-API-compatible |
| Model | `openai/gpt-5-mini` — $0.25/M in, $2.00/M out, 400k ctx | verified tool-capable on OpenRouter today; `openai/gpt-5-nano` ($0.05/M in) is the cheap fallback |
| Validation | Zod at every provider boundary | Qloo shape changes fail loudly |
| Tests | Vitest | engine is pure, so unit tests cover the logic that matters |
| Hosting | Vercel | free, public URL, day-one deploy |
| Persistence | `localStorage` + route encoded in share URL | no DB, no cost, matches "save/share locally" |

### Budget guard

The OpenRouter key has **$4.79 of credit left** (usage $4.27 of a $5 limit,
checked 23 Oct). A public demo URL that judges and 2,239 other participants can
hit is an open spend tap, so the agent loop is capped:

- maximum 6 tool-call rounds per route, hard stop
- maximum 12k input tokens per round
- a request counter in memory; past a daily ceiling the app serves
  `FixtureProvider` routes with the fixture banner showing, rather than erroring

At roughly $0.006 per route on `gpt-5-mini`, the remaining credit covers about
700 routes. That is enough for judging, but only with the caps in place.
Christopher should consider topping up OpenRouter before submission.

`@openai/agents` (0.21.0) was considered and rejected: a 0.x framework with
breaking changes landing weekly is the wrong dependency to meet a seven-day
deadline. A hand-rolled tool loop over the stable SDK satisfies "functions as an
agentic tool" and leaves the control we need for the bounded-authority design.

## 6. Data contract

TasteRoute owns every type below. Qloo appears only inside `providerRef` and
`Evidence.source`.

```ts
// ---- inputs ----
type RouteRequest = {
  city: string                 // free text, resolved via provider
  mood: string                 // free text, interpreted by the agent
  timeWindow: { startHour: number; endHour: number }
}

type Locality = {
  name: string
  qlooLocalityId?: string
  centroid?: { lat: number; lng: number }
}

// ---- provider boundary ----
interface TasteProvider {
  readonly kind: 'qloo' | 'fixture'
  findTags(query: string): Promise<Tag[]>
  seedEntities(names: string[]): Promise<EntityRef[]>
  suggestPlaces(q: PlaceQuery): Promise<PlaceResult>
}

type Tag = { id: string; name: string; type: string; popularity: number }

type EntityRef = { entityId: string; name: string }

type PlaceQuery = {
  locality: string
  tags?: { id: string; weight?: number }[]
  entities?: string[]
  take?: number                // capped at 50 by Qloo
}

type PlaceResult = {
  candidates: Candidate[]
  explainability: ProviderExplainability | null   // null when Qloo could not compute it
  warnings: string[]
}

type Candidate = {
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
  providerRef: { provider: 'qloo' | 'fixture'; entityId: string }
}

// ---- outputs ----
type EvidenceKind = 'explainability' | 'tag' | 'affinity' | 'descriptor' | 'popularity'

type Evidence = {
  kind: EvidenceKind
  label: string                // human-readable, e.g. "tagged Cocktail Bar"
  value?: string | number
  source: 'qloo'               // never 'model'
}

type Stop = {
  order: 1 | 2 | 3
  slot: 'open' | 'main' | 'close'
  candidate: Candidate
  why: string                  // composed from evidence, never free-generated
  evidence: Evidence[]         // non-empty, or `why` falls back to neutral text
  walkFromPrev?: { metres: number; minutes: number }
}

type Confidence = 'strong' | 'ok' | 'weak'

type Route = {
  id: string
  locality: Locality
  mood: string
  createdAt: string
  stops: Stop[]                // exactly 3
  confidence: Confidence
  alternatives: Candidate[]    // surfaced when confidence is 'weak'
  trace: TraceEntry[]
}

type TraceEntry = {
  at: string
  tool: string
  argsSummary: string          // never includes the API key
  resultSummary: string        // counts and names, never a full response body
  ms: number
}
```

### Provider swap

`FixtureProvider` and `QlooProvider` are interchangeable. Fixtures are labelled
`kind: 'fixture'` and the UI renders a visible banner whenever a route was built
from them. A fixture route can never be presented as live Qloo data — that would
be a false claim to judges, and the kind of thing that loses a hackathon on
integrity rather than on code.

## 7. Scoring and ordering

Pure functions in `src/lib/route/`. Same input, same output, always.

### Slot assignment

Each candidate maps to zero or more slots by its Qloo tags and category:

- `open` — cafe, bakery, casual, dessert, gallery
- `main` — restaurant, cuisine-tagged places, activity venues
- `close` — bar, cocktail bar, lounge, live music, nightlife

A candidate matching no slot is dropped. A candidate matching several is
eligible for each.

### Score

```
score = 0.40 · affinityNorm
      + 0.30 · tagMatch          // share of requested tags present on the candidate
      + 0.15 · slotFit           // how characteristic the candidate is of its slot
      + 0.10 · descriptorMatch   // good_for / ambience alignment
      + 0.05 · popularityNorm

penalties:
  − 0.25  category already used by a chosen stop
  − 0.50  is_closed is true
  − 0.30  hours exclude the requested time window
```

`affinity` arrives as 0–1 from Qloo. When it is null the weight redistributes
proportionally across the remaining terms rather than scoring the candidate as
zero — a missing signal is not a negative signal.

### Ordering

1. Pick the highest scorer for each of `open`, `main`, `close`.
2. Reorder the three to minimise total walking distance, subject to the
   constraint that `close` stays last. Nobody wants the bar first.
3. Compute `walkFromPrev` from `geocode` using haversine distance at 80 m/min.

With three stops the permutation space is trivial, so this is exact, not
heuristic.

### Tests

- score rises monotonically with affinity, all else equal
- a candidate matching more requested tags outscores one matching fewer
- `is_closed` candidates never appear in a route
- no two stops share a category
- ordering returns the minimal-distance permutation with `close` last
- null affinity does not rank a candidate below an equivalent zero-affinity one
- identical input produces byte-identical output across runs

## 8. Explanations and the evidence rule

**A reason may only state what the data supports.** This is enforced in code,
not left to prompt discipline.

`buildWhy(candidate, request, explainability): { why, evidence }` collects
evidence in priority order:

1. **`explainability`** — when Qloo computed it (entity-seeded queries only),
   the strongest available: "recommended because you liked NOK by Alara".
2. **`tag`** — the candidate's own Qloo tags intersected with the requested
   ones: "tagged Cocktail Bar and Live Music".
3. **`affinity`** — the numeric taste score: "0.88 taste match for your mood".
4. **`descriptor`** — `good_for`, `ambience_description`, `cuisine_description`.
5. **`popularity`** — weakest, used only as a tiebreak mention.

If the collected evidence array is empty, `why` returns a neutral factual
string ("a {category} in {locality}") and the UI marks the stop as
*unexplained*. It never fabricates a rationale.

The language model is not in this path. It chooses which queries to run; it does
not write the reasons. A test asserts that a candidate stripped of all tags,
affinity and descriptors yields empty evidence and the neutral string.

## 9. Weak signal handling

`assessSignal(candidates, requested)` returns `strong | ok | weak`:

- `weak` — fewer than 6 slot-eligible candidates, or median affinity below 0.3,
  or no slot can be filled
- `ok` — enough to build a route, but thin in at least one slot
- `strong` — every slot has three or more eligible candidates

On `weak`, the agent is instructed to re-query with broader or different tags
before accepting. If it still comes back weak, the route is returned with
`confidence: 'weak'`, a plain-language banner explaining which part was thin,
and `alternatives` populated so the user can swap a stop themselves.

The product position: a route the app is unsure about, labelled as such, beats a
confident-looking route built on four results. This is the honesty requirement
from the brief, made mechanical.

## 10. Security and data rules

| Rule | Mechanism |
|---|---|
| Qloo key never reaches the browser | all Qloo calls in server route handlers; key read from `process.env` only |
| Keys never committed | `.env.local`, `.env*.local` in `.gitignore` before first commit; `.env.local` is `chmod 600` |
| Keys never logged | trace entries carry `argsSummary`, a built string; no header or env interpolation |
| Qloo response data never in the public repo | `qloo-cache/` and `*.qloo.json` gitignored; fixtures are hand-written, not captured responses |
| No false liveness claims | `provider.kind` drives a visible banner; fixtures always disclosed |
| No invented client or usage claims | README states what it is: a TechClave product built for the Qloo hackathon |

Fixtures being hand-written rather than captured matters: a captured response is
Qloo's data, and the brief forbids putting Qloo response data in the public repo.
Hand-authored fixtures shaped like the real schema carry no such problem.

## 11. Testing strategy

TDD, engine first, network last.

- **Pure unit** (the bulk): scoring, slot assignment, ordering, evidence
  collection, signal assessment, share-URL encode/decode round-trip.
- **Contract**: Zod schemas parse hand-written fixtures that mirror observed
  Qloo shapes; a malformed payload fails loudly.
- **Parameter allowlist**: an unknown outbound parameter name throws before the
  request is built. This is the specific defence against Qloo's silent-ignore
  behaviour.
- **One live smoke test**, skipped when `QLOO_API_KEY` is absent, asserting a
  200 and a non-empty entity list for Lagos. Kept out of CI.
- **Manual pass** on a phone viewport before submission.

## 12. Build slices

| Day | Slice | Done when |
|---|---|---|
| 23 Oct | **0 — skeleton and deploy** | Next.js app on Vercel with a public URL, MIT licence, README stub. Renders a static placeholder. Nothing clever, but *reachable*. |
| 24 Oct | **1 — engine** | `types.ts`, `fixture.ts`, `score.ts`, `order.ts`, `why.ts`, `assess.ts` all green under Vitest. No network, no UI. |
| 25 Oct | **2 — Qloo adapter** | `QlooProvider` behind the same interface, Zod-validated, parameter allowlist enforced, live smoke test passing. |
| 26 Oct | **3 — agent loop** | Tool definitions, server-side loop, trace capture. Agent builds a real route end to end from a mood string. |
| 27 Oct | **4 — UI** | Mobile-first flow: city + mood + window → route with per-stop reasons and the live trace panel. Weak-signal banner working. |
| 28 Oct | **5 — save and share** | `localStorage` saves, share URL round-trips, alternatives swap. |
| 29 Oct | **6 — polish and submit** | README with the Qloo-powered description, licence visible in About, final deploy, Devpost submission written. |
| 30 Oct | **buffer** | Deadline is 11:45pm EDT. Nothing new ships today. |

Slice 0 ships today because the hosted-demo requirement is pass/fail and
deployment problems discovered on day six are fatal.

`STATUS.md` is updated at the end of each slice with commands, decisions taken,
and remaining submission steps.

## 13. Open items

1. **Model credentials — resolved, with a caveat.** `OPENAI_API_KEY` exists in
   `Booking/Booking/.env.local` but is dead: `GET /v1/models` returns **401**.
   `OPENROUTER_API_KEY` in the same file returns **200** with $4.79 of credit.
   The build therefore uses the OpenAI SDK against OpenRouter's
   OpenAI-compatible endpoint, which keeps the code portable to a real OpenAI key
   later by changing one environment variable.
   **Decision needed:** top up OpenRouter, or supply a working OpenAI key.
   Neither blocks slices 0–2.
2. **Demo city.** Lagos is the default given confirmed coverage and the
   TechClave audience. Abuja, Port Harcourt, Nairobi and Accra all verified as
   backups.
3. **Repo visibility.** Must be public before submission. Christopher decides
   when to push and under which account; nothing is pushed without approval.
4. **Key hygiene.** The Qloo hackathon key was read from Gmail into
   `~/Techclave/tasteroute/.env.local` (chmod 600, gitignored) and so is present
   in this session's transcript. Qloo deactivates hackathon keys after judging,
   so no rotation is planned. The OpenRouter key is referenced from Booking's
   env file and has not been copied or printed.

## 14. What would make this the wrong build

Stated plainly so it can be checked later:

- If the agent turns out to add nothing over a fixed query sequence, the agentic
  layer is decoration and the honest move is to say so rather than defend it.
- If Qloo's tag taxonomy cannot express moods usefully, the mood input is a lie
  and should become explicit tag selection instead.
- If three stops cannot be reliably filled in a given city, the product is a
  single recommendation with reasons, not a route.

Each is a visible failure during slices 1–3, not a surprise at the end.
