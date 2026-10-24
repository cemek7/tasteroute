# TasteRoute — richer intent capture

**Date:** 24 October 2026
**Owner:** Christopher Emeka (TechClave)
**Status:** awaiting review
**Supersedes nothing.** Extends `2026-10-23-tasteroute-design.md`, which stands.

---

## 1. Why

TasteRoute currently asks three questions — city, mood, time — and that is too
little to plan an evening for a specific person. Two people typing "cocktails
and live music" into the same city get the same three stops, whether one is on
a first date and the other is out with eight colleagues.

It is also leaving the best of Qloo's data unused. Measured against the live
hackathon host on 24 Oct:

- Default results for Abuja come back at **popularity 0.984–0.997**. Qloo's
  unfiltered answer is the most famous places in the city, which is why early
  routes were a mall, a supermarket and a Domino's.
- `filter.popularity.max=0.4` returns a set with **zero overlap** with that
  baseline, at popularity 0.38–0.397.

So "hidden gems rather than mainstream guides" — the thing the UrbanEx deck
sells as its reason to exist — is one parameter away, and it is simultaneously
the fix for the output-quality problem the first build ran into. That is the
single highest-value change available.

The UrbanEx deck (Belsoft Systems, privileged and confidential) is the product
reference here, as before: the newcomer-versus-local framing and the
"personalised by interests, demographics and location" idea are carried across.
**Nothing from the deck — its text, branding, feature names, or the UrbanEx
name — appears in this product.**

### Success criteria

1. A judge can still get a route in under a minute without answering anything
   new. Every new field is optional.
2. Two different people, same city and same mood, get materially different
   routes once they say who they are and what the night is for.
3. A stated requirement — halal, wheelchair access, a hard budget — is never
   traded away for a better taste match.
4. The discovery control visibly changes the city you get back.
5. Nothing a person tells us about themselves is stored or logged.

## 2. Non-goals

- Accounts, login, server-side profiles. Intent lives in the request and the
  URL. Section 10 does remember the tuning panel on the device, which is a
  convenience in the browser, not a profile: nothing identifying is kept, it
  never leaves the machine, and the person can clear it.
- Events and ticketing. Qloo's place catalogue is the product.
- More than three stops. Swapping covers "more options".
- Inferring demographics. If we do not ask, we do not guess.
- Maps and turn-by-turn directions.

## 3. The contract

This is the whole change, and three things read it: the form that sends it, the
validator that checks it, and the share encoder that round-trips the result.

```ts
// ---------- controlled vocabularies ----------
type VibeId =
  | 'lively' | 'quiet' | 'intimate' | 'upscale' | 'casual' | 'outdoor'

type OccasionId =
  | 'date_night' | 'first_date' | 'birthday' | 'anniversary'
  | 'celebration' | 'catching_up' | 'work_dinner' | 'solo_night'

type PartyComposition =
  | 'solo' | 'couple' | 'friends' | 'family' | 'colleagues'

/** UrbanEx's framing: a newcomer wants different things from a local. */
type Persona = 'newcomer' | 'local' | 'visiting'

type AgeBand =
  | '24_and_younger' | '25_to_29' | '30_to_34' | '35_to_44'
  | '45_to_54' | '55_and_older'

type DietaryId = 'halal' | 'vegetarian' | 'vegan' | 'gluten_free' | 'kosher'

type AccessibilityId = 'wheelchair_entrance' | 'wheelchair_restroom' | 'step_free'

// ---------- the request ----------
type RouteRequest = {
  // Required.
  city: string
  mood: string
  timeWindow: { startHour: number; endHour: number }

  // What kind of evening. All optional.
  vibe?: VibeId[]
  occasion?: OccasionId

  // Who is going. All optional.
  party?: { size: number; composition?: PartyComposition }
  persona?: Persona
  /**
   * Optional, and framed in the UI as helping Qloo match taste patterns.
   * Never required, never stored, never logged. See section 9.
   */
  demographics?: { ageBand?: AgeBand; gender?: 'male' | 'female' }

  // How to choose. All optional.
  discovery?: number            // 0 = the famous ones, 1 = hidden gems
  budget?: 1 | 2 | 3 | 4
  area?: { radiusMetres: number } | null   // null or absent = whole city

  // Non-negotiable. Optional to supply, absolute once supplied.
  requirements?: {
    dietary?: DietaryId[]
    accessibility?: AccessibilityId[]
  }
  avoid?: string[]              // free text, resolved to tags, then excluded

  // Taste seeds.
  seedPlaces?: string[]         // "places you already like"
}
```

The wire body keeps `startHour` / `endHour` as integers and is normalised into
`timeWindow` by `parseRouteBody`, exactly as it is today — including the
midnight wrap.

### Response

```ts
type RouteResponse = {
  route: Route
  roundsUsed?: number
  notice?: string               // e.g. the daily ceiling message
}
```

`Route` gains two fields:

```ts
alternativesBySlot: Record<SlotName, Candidate[]>   // scored runners-up, for swapping
intentEcho: IntentEcho                             // what the app understood
```

`IntentEcho` is how the app shows its working on the intake side, the way the
trace panel does on the query side:

```ts
type IntentEcho = {
  /** One short line per dimension that actually changed the search. */
  applied: { label: string; detail: string }[]
  /** Dimensions the person gave that Qloo had nothing for. Stated, not hidden. */
  ignored: { label: string; reason: string }[]
}
```

A person who asks for halal and gets told "halal: no tagged venues in Abuja,
so this was not applied" is better served than one who gets a silent
substitution. This is the same honesty rule as the weak-signal banner.

## 4. Requirements are not preferences

The load-bearing distinction, and the reason this is a spec rather than a form
tweak.

**Requirements become hard Qloo filters.** Dietary needs and accessibility
needs are not taste. Somebody who needs a wheelchair-accessible entrance and
gets a venue without one has been failed, however good the cocktails are. The
same is true of a stated budget ceiling: "under ₦₦" is a constraint, not a
leaning.

So `requirements`, `budget`, `area` and `avoid` are applied by **our code**, as
`filter.tags`, `filter.price_level.max`, `filter.location` + radius and
`filter.exclude.tags`. The agent cannot reach them, cannot weigh them against a
taste match, and cannot forget them.

**Preferences become weighted signals.** `vibe`, `occasion`, `party`, `persona`
and `demographics` are what the agent is for: it resolves them into real Qloo
tag URNs and passes them as `signal.interests.tags` with weights, then reads
the assessment and widens if the result is thin.

There is a cost, stated plainly: a hard filter can empty the pool. Qloo's
`filter.tags` returned **zero** results in testing for a tag that had plenty of
signal-based matches. So:

- a requirement that empties a slot is reported in `intentEcho.ignored` with
  the reason, and the route is built without it rather than refused
- the route's `confidence` drops to `weak` when any requirement had to be
  dropped, because the app no longer knows the stops meet the person's needs

That is the honest handling. Quietly dropping a dietary requirement to return a
prettier route would be the worst behaviour this product could have.

## 5. Mapping, verified

Every row below was confirmed against `hackathon.api.qloo.com` on 24 Oct.

| Field | Qloo | Applied by | Evidence |
|---|---|---|---|
| `discovery` | `filter.popularity.max` (high) / `.min` (low) | our code | 0/20 overlap with baseline; returned 0.38–0.397 |
| `budget` | `filter.price_level.max` | our code | 4/20 overlap; every result at or under the cap |
| `area.radiusMetres` | `filter.location=POINT(lng lat)` + `filter.location.radius` | our code | distinct sets at 1km / 5km / 25km |
| `requirements.dietary` | `filter.tags` = `urn:tag:dietary_option:qloo:halal` etc. | our code | tags exist for halal, vegetarian, vegan |
| `requirements.accessibility` | `filter.tags` = `urn:tag:accessibility:place:wheelchair_accessible_entrance` etc. | our code | four accessibility tags found |
| `avoid` | `filter.exclude.tags` | our code | accepted, 200 |
| `vibe` | `signal.interests.tags` = `urn:tag:ambience:qloo:lively\|quiet\|intimate\|upscale\|casual\|outdoor`, plus `noise_level:qloo:quiet` | agent | all six resolve |
| `occasion` | `urn:tag:event:place:date_night\|anniversary\|birthday`, `urn:tag:good_for:qloo:first_date\|celebrations\|anniversary_dinners` | agent | all resolve |
| `party.composition` | `urn:tag:customer_identity:qloo:couples\|groups_of_friends\|solo_diners`, `urn:tag:good_for:qloo:groups\|solo_dining` | agent | all resolve |
| `persona` | sets the `discovery` default and adds `urn:tag:neighborhood_characteristics:qloo:*`; a newcomer leans to hidden gems, a local to the familiar | our code + agent | neighbourhood tags resolve |
| `demographics` | `signal.demographics.age`, `signal.demographics.gender` | our code | valid bands confirmed; `25_and_younger` is **not** a value, `24_and_younger` is |
| `seedPlaces` | `signal.interests.entities` via `/search` | agent | already working; the only path that yields explainability |

The agent resolves preference tags by **querying** `/v2/tags` at runtime, not
from a table in our source. That is what keeps the Qloo-powered claim true:
remove Qloo and the vocabulary itself disappears.

### Two defaults worth stating

`persona: 'newcomer'` sets `discovery` to 0.75 unless the person moved the
control. A newcomer asking for an evening out does not want the mall.

`discovery` is a number, not a boolean, and maps to a band rather than a cliff:
0.0–0.33 sets `filter.popularity.min=0.8`, 0.34–0.66 applies no popularity
filter, 0.67–1.0 sets `filter.popularity.max=0.5`.

## 6. The interface

Progressive disclosure. The first screen is what exists today plus nothing:
city, mood, hours, and a button that plans immediately.

Below it, a collapsed **"Tune this"** panel, closed by default:

```
▾ Tune this
   The night is for   [ date night ▾ ]
   Vibe               (lively) (quiet) (intimate) (upscale) (casual) (outdoor)
   Going with         [ just us ▾ ]   how many [ 2 ]
   Famous ●──────────────────── Hidden gems
   Budget             ₦   ₦₦   ₦₦₦   ₦₦₦₦
   Stay within        [ anywhere in the city ▾ ]
   Must have          [ ] halal  [ ] vegetarian  [ ] step-free access
   Places you like    [ Jazzhole                        + ]
   Rather avoid       [ hookah                          + ]

   ▸ About you (optional, improves matching)
      Age   [ prefer not to say ▾ ]
      Gender[ prefer not to say ▾ ]
```

Three rules for this panel:

1. **Nothing is required and nothing is pre-selected** except the discovery
   slider, which sits at the persona default.
2. **"About you" is nested one level deeper and defaults to "prefer not to
   say".** It carries a one-line explanation of why it is being asked.
3. **Whatever the person set is echoed back above the route** from
   `intentEcho`, including what was ignored and why.

The returned route renders as today, plus a **swap** control per stop.

## 7. Richer stop cards, from data already paid for

Every Qloo place response already carries far more than the app shows. Counted
across five Abuja results on 24 Oct:

| Field | Present | Shape |
|---|---|---|
| `image.url` | 5/5 | `{ url }` on Qloo's CDN |
| `images[]` | 5/5 | array of `{ url, type }` |
| `business_rating` | 5/5 | float |
| `neighborhood` | 4/5 | string, e.g. "Katampe" |
| `neighborhood_description` | 4/5 | prose |
| `phone` | 4/5 | string |
| `overall_description` | 3/5 | prose |
| `unique_selling_points` | 3/5 | prose |
| `hours` | 3/5 | weekday map |
| `price_level` | **1/5** | integer |
| `website` | **0/5** | absent for Abuja |

`Candidate` gains an optional `media` and `detail` block carrying these,
normalised and null-safe at the provider boundary like everything else:

```ts
media?: { imageUrl?: string; imageUrls?: string[] }
detail?: {
  neighborhood?: string
  neighborhoodNote?: string      // first sentence of neighborhood_description
  about?: string                 // first sentence of overall_description
  standout?: string              // first sentence of unique_selling_points
  rating?: number
  phone?: string
  website?: string
  openTonight?: { from: number; to: number } | null
}
```

A stop card then shows a photo, the neighbourhood, the rating, whether it is
open during the requested window, and one line about the place — on top of the
existing reason and evidence chips.

Three rules carried from the existing honesty design:

1. **Absent is absent.** No placeholder images, no "4.0 (estimated)". A stop
   with no photo renders without one; the layout does not depend on it.
2. **Prose is quoted, not paraphrased.** `overall_description` is Qloo's
   marketing copy. It is attributed and truncated to its first sentence, the
   same treatment `ambience_description` already gets.
3. **`openTonight` is derived, not asserted.** It comes from the same
   `openRanges` parser the scoring uses, so the card cannot disagree with the
   score.

Images come from `images.qloo.com`, so Next's image config needs that host
allow-listed. Plain `<img>` with explicit dimensions and `loading="lazy"` is
sufficient and avoids an optimiser dependency.

## 8. The agent asks one clarifying question

"Something nice" is not a plan. Rather than guess, or ask for everything up
front, the agent may ask **one** question before planning — and only when
answering it would change which Qloo queries it runs.

This is the most genuinely agentic behaviour in the product. The model is not
choosing stops; it is deciding **whether the intent it has been given is
sufficient to act on**, which is judgment, and the question it asks is visible
evidence of that judgment to anyone watching.

### It lives on its own endpoint

`POST /api/clarify` takes the same body as `/api/route` and runs the model with
exactly one tool available:

```ts
ask_user({
  question: string,          // one short sentence
  options: string[],         // 2-4 concrete choices
  because: string,           // why this changes the search
})
```

It returns either `{ question, options, because }` or `{ clear: true }`.

`/api/route` is untouched: still one phase, still the same contract, still
covered by its existing tests. The answer arrives on the next request as one
more optional field:

```ts
clarified?: { question: string; answer: string }
```

which the agent receives as context and may turn into tags like any other
preference.

This is a deliberate revision. An earlier draft of this spec made `/api/route`
two-phase with a resume token, ranked the feature last, and marked it first to
cut. That was the wrong shape: the risk came from the design, not the feature,
and a separate endpoint removes it. Nothing is stored between calls because
there is nothing to store — the client holds the question and sends the answer
back with the request it was going to send anyway.

### Rules, enforced in code rather than asked of the prompt

- **One question, then plan.** The clarify endpoint is called at most once per
  route by the client, and the model has no second tool to reach for.
- **Options are required.** A free-text follow-up is just a second form. A
  response without 2 to 4 options is treated as `{ clear: true }`.
- **Skipping is always available and always safe.** The UI shows "just plan
  it" beside the choices. Skipping sends no `clarified` field and the route is
  planned on defaults.
- **A clear request is not interrupted.** If the mood already names a vibe, a
  venue kind or an occasion, the model is told to return `clear`. A question on
  every request means the gate is wrong.
- **The question, the answer, and a skip all appear in the trace**, so the
  route stays auditable either way.
- **It shares the spend limiter.** Past the daily ceiling the clarify endpoint
  returns `{ clear: true }` rather than spending, so the fallback is a plain
  route rather than an error.

### Cost

One extra model call per route, on a prompt carrying only the city, the mood
and the time window — no Qloo results, no tool schemas beyond the one. On
`gpt-5-mini` that is well under a tenth of a cent, against roughly $0.006 for
the planning call it precedes.

## 9. A narrative for the evening

Per-stop reasons explain each choice. They do not explain the *shape* of the
night: that it starts quiet and ends loud, that the walk between two and three
is the long one, that the last stop is the only one open past midnight.

`Route` gains:

```ts
narrative: { line: string; evidence: Evidence[] }
```

Composed by a pure function from facts already computed — slot order, the
vibe tags each stop matched, total walking time, the time window, and
confidence. Not generated by the model, for the same reason the reasons are
not: a sentence the data does not support is worse than no sentence.

Worked example of the intended output:

> Starts quiet at a cafe in Wuse, builds through dinner, and finishes at the
> only one of the three still open at 1am. Twenty minutes of walking in total.

When the facts are thin, the line is short rather than padded: "Three stops in
Wuse, eleven minutes of walking." A test asserts the narrative cites only
facts present in the route, and that it never claims a vibe no stop matched.

## 10. Remembering preferences on this device

Accounts remain a non-goal. The tuning panel's settings persist in
`localStorage` under one key, separate from saved routes:

```ts
type StoredPreferences = {
  version: 1
  vibe?: VibeId[]
  occasion?: OccasionId
  party?: { size: number; composition?: PartyComposition }
  persona?: Persona
  discovery?: number
  budget?: 1 | 2 | 3 | 4
  requirements?: { dietary?: DietaryId[]; accessibility?: AccessibilityId[] }
  avoid?: string[]
}
```

What is deliberately **not** stored: `demographics`, `city`, `mood`,
`timeWindow` and `seedPlaces`. Age and gender are not kept even on the device,
per section 14. The rest change every time you go out.

Behaviour:

- Loaded on mount, with every field validated the same way a share link is —
  a hand-edited or stale entry is discarded, not trusted.
- `version` gates the shape; an unknown version is dropped silently.
- A visible "forget my preferences" control. Storage the user cannot clear
  from inside the product is a trap.
- Storage access is wrapped: private browsing throws, and the page must render
  anyway. The existing `saveRoute` already sets this pattern.

## 11. Two findings that constrain the design

**`price_level` is sparse.** Only 1 of 5 Abuja places carried it. Used as a
hard `filter.price_level.max`, budget would discard most of the city for a
field most venues lack. So budget is applied as a hard filter **only when the
pool stays viable**: if it empties a slot, it is relaxed to a scoring
preference and reported in `intentEcho.ignored` as "budget could not be
applied strictly — few places here publish a price level". A stated ceiling
still never produces a stop known to exceed it; what it cannot do is exclude
places with no price data at all.

**Discovery surfaces non-venues.** At `filter.popularity.max=0.5` the top
Abuja result was *Grandview Estates*, `primary_genre:
urn:tag:genre:place:housing_complex`. The famous end of the catalogue is malls
and hotels; the obscure end is housing estates, car parks and offices. The
existing lodging deny-list does not catch these.

So slot assignment moves from a deny-list to an **allow-list of venue kinds**,
read from `properties.primary_genre.id` — which is a single clean URN per place
and a better source than the deepest-tag heuristic currently in use. A place
whose primary genre is not a recognised going-out kind gets no slot, whatever
its affinity. This replaces guesswork with Qloo's own classification.

**This supersedes the category decision in the 23 Oct spec**, which read the
deepest genre tag because `primary_genre` had not been noticed. The deepest-tag
path stays as the fallback for a place that carries no `primary_genre`, so the
behaviour only improves where the better field exists.

## 12. Swapping a stop

`alternativesBySlot` carries the scored runners-up the engine already computed
and discarded. Swapping picks the next candidate for that slot, recomputes
walking times client-side, and re-renders. No Qloo call, no model round, no
spend.

Constraints that must survive a swap: no duplicate place, no duplicate
category, `close` stays last. The alternatives list is filtered for those
before it leaves the server, so the client cannot construct an invalid route.

## 13. Backward compatibility

Every new field is optional. A body carrying only `city`, `mood`, `startHour`
and `endHour` behaves exactly as it does today.

Share links are the real risk, because the encoder validates strictly and was
only just hardened. `alternativesBySlot` and `intentEcho` are therefore
**optional in the share schema** with empty defaults, so links created before
this change still decode. A test pins that.

## 14. Handling what people tell us about themselves

Age and gender are optional inputs to a recommendation, not a profile.

- Never required. The default is "prefer not to say", and a route planned
  without them works.
- Never stored. They live in the request and in the share URL the person
  chooses to copy. There is no database.
- Never logged. The existing trace carries `argsSummary` strings built by our
  code; demographics are applied as provider parameters by the server and do
  not enter the trace.
- Qloo's own vocabulary is binary for gender; the UI offers "prefer not to say"
  as the default third option and does not pretend the API is richer than it is.
- The UI states why it is asked, in one line, next to the field.

## 15. Testing

Same shape as the existing suite: pure functions, no network.

- **Vocabulary resolution**: each `VibeId`, `OccasionId` and `PartyComposition`
  maps to at least one tag query; an unknown id is rejected at the boundary.
- **Requirements are hard**: a candidate lacking a required tag never appears
  in a route, at any affinity. The test sets affinity 0.99 on the
  non-conforming candidate.
- **Dropped requirement is reported**: when a requirement empties a slot, the
  route still builds, `intentEcho.ignored` names it, and `confidence` is `weak`.
- **Discovery band**: 0.1 / 0.5 / 0.9 produce `popularity.min`, no popularity
  parameter, and `popularity.max` respectively.
- **Budget is a ceiling**: no stop exceeds the requested `price_level`.
- **Demographics never reach the trace**: a request carrying age and gender
  produces a trace containing neither.
- **Swap validity**: every candidate in `alternativesBySlot` can replace its
  stop without duplicating a place or a category.
- **Old share links decode**: a payload without `alternativesBySlot` or
  `intentEcho` still returns a route.
- **Live, skipped without a key**: one request carrying every dimension returns
  a route, and one carrying an impossible requirement reports it as ignored.

Added by sections 7 to 11:

- **Absent media is absent**: a candidate with no `image` renders a card with
  no image element, and the card's layout does not shift.
- **Prose is attributed and cut**: a 400-character `overall_description`
  becomes one quoted sentence under 90 characters.
- **`openTonight` agrees with scoring**: for any candidate and window, the card
  claims open if and only if `outsideWindow` returns false.
- **A response without usable options is treated as clear**: zero, one or five
  options yields `{ clear: true }` rather than an unanswerable prompt.
- **A specific mood is not interrupted**: a mood naming a vibe and a venue kind
  returns `{ clear: true }`.
- **Skipping is safe**: a request with no `clarified` field plans normally,
  which is the existing path and must stay green.
- **An answer reaches the planner as context**: a request carrying `clarified`
  puts it in the agent's first message, and the trace records it.
- **Past the ceiling, clarify does not spend**: the limiter being exhausted
  returns `{ clear: true }`.
- **The narrative cites only facts**: a route whose stops matched no vibe tag
  produces a narrative mentioning no vibe, and the walking total in the line
  equals the sum of the legs.
- **Stored preferences are validated**: a hand-edited or wrong-version entry in
  `localStorage` is discarded rather than loaded.
- **Demographics are never persisted**: after a request carrying age and
  gender, `localStorage` contains neither.
- **Venue-kind allow-list**: a place whose `primary_genre` is
  `housing_complex`, `car_park` or `office` gets no slot at affinity 0.99.
- **Budget relaxes rather than empties**: when every candidate lacks
  `price_level`, the route still builds and `intentEcho.ignored` names budget.

## 16. Open items

1. **Radius needs a city centre before searching.** Resolved by one untagged
   query per request, taking the top result's `geocode` as the centre. One
   extra Qloo call; no new dependency. If that proves unreliable we fall back to
   `filter.location.query` and report radius as ignored.
2. **Does `signal.demographics` change results?** Valid values were confirmed
   accepted, but a differential test (same query, different age band) has not
   been run. Task 1 of the plan runs it. If results are identical, the field is
   decorative and must be removed rather than shipped as theatre.
3. **`filter.tags` strictness.** It returned zero results in one probe. The
   dropped-requirement path exists because of that, but the exact behaviour
   with multiple required tags is untested.
4. **Does Qloo's image CDN allow hotlinking?** The URLs are public and the
   demo is public, so this should hold, but it is unverified. Task 1 fetches
   one image and checks the status. If it 403s, the cards drop photos and keep
   everything else.
5. **The clarifying question is now low-risk.** On its own endpoint it does
   not touch `/api/route` at all, so it can ship early and be removed by
   deleting one route handler and one component. It is also the strongest
   judging material, so it ships third.
6. **Deadline.** 30 October, 11:45pm EDT. This is well over six days of
   comfortable work, so the cut order matters. Keep, in this order:

   1. **Discovery slider + venue-kind allow-list** — fixes output quality, and
      the allow-list is needed the moment discovery ships.
   2. **Requirements, budget, area** — the hard filters, and `intentEcho`
      with them, because a silently dropped requirement is the one defect this
      product must not have.
   3. **The clarifying question** — the strongest evidence of agency, and on
      its own endpoint it risks nothing already built.
   4. **Richer stop cards** — largest visible gain per hour of work; the data
      is already in hand.
   5. **Occasion, vibe, party, persona** — the preference signals.
   6. **Narrative** — pure function over facts already computed.
   7. **Swap a stop** — no new Qloo or model spend.
   8. **Stored preferences** — convenience only.
   9. **Demographics** — may be deleted outright after item 2 of these open
      items is answered.

## 17. What would make this the wrong build

- If `signal.demographics` turns out not to change results, asking people their
  age and gender is an intrusion that buys nothing. Remove the field.
- If hard `filter.tags` empties the pool for most real requirements, then
  requirements cannot be honoured through Qloo and the product should say so up
  front rather than offer checkboxes that rarely work.
- If the "Tune this" panel measurably slows a first-time user to their first
  route, the default-collapsed design has failed and the panel should move to a
  second screen reached from the result.
- If the clarifying question fires on inputs that were already clear, it is an
  obstacle rather than intelligence. One question that earns its place is the
  bar; a question on every request means the gate is wrong and it should be
  restricted to inputs under a length or specificity threshold. Measure this on
  real moods before shipping, not after.
- If the narrative reads as filler on real routes rather than telling the
  reader something they did not already see in the three cards, it is
  decoration and should be cut.
