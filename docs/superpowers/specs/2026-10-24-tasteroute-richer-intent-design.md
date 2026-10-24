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

- Accounts, login, saved profiles. Intent lives in the request and the URL.
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

## 7. Swapping a stop

`alternativesBySlot` carries the scored runners-up the engine already computed
and discarded. Swapping picks the next candidate for that slot, recomputes
walking times client-side, and re-renders. No Qloo call, no model round, no
spend.

Constraints that must survive a swap: no duplicate place, no duplicate
category, `close` stays last. The alternatives list is filtered for those
before it leaves the server, so the client cannot construct an invalid route.

## 8. Backward compatibility

Every new field is optional. A body carrying only `city`, `mood`, `startHour`
and `endHour` behaves exactly as it does today.

Share links are the real risk, because the encoder validates strictly and was
only just hardened. `alternativesBySlot` and `intentEcho` are therefore
**optional in the share schema** with empty defaults, so links created before
this change still decode. A test pins that.

## 9. Handling what people tell us about themselves

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

## 10. Testing

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

## 11. Open items

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
4. **Deadline.** 30 October, 11:45pm EDT. This is six days of work compressed
   into a few; if it has to be cut, the order to keep is: discovery slider,
   requirements, occasion and party, swap, demographics.

## 12. What would make this the wrong build

- If `signal.demographics` turns out not to change results, asking people their
  age and gender is an intrusion that buys nothing. Remove the field.
- If hard `filter.tags` empties the pool for most real requirements, then
  requirements cannot be honoured through Qloo and the product should say so up
  front rather than offer checkboxes that rarely work.
- If the "Tune this" panel measurably slows a first-time user to their first
  route, the default-collapsed design has failed and the panel should move to a
  second screen reached from the result.
