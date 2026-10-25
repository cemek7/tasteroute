# Review rulings and deferred minors

25 October 2026. Every decision taken on Christopher's behalf while building
the richer-intent branch and fixing the whole-branch review, and every finding
deliberately not fixed. Copied out of the SDD ledger so it survives the
scratch directory being deleted.

The format is `Ruling: <what was decided> — <why> — <what it costs if wrong>`.

# SDD ledger — plan: docs/superpowers/plans/2026-10-24-richer-intent.md

Setup: Ruling: no worktree. This continues work on main in a repo whose only
workstream is this product, with the user's explicit "proceed". The branch is
already pushed to a public remote, so the history is recoverable.
Cost if wrong: none; nothing else shares this repo.

Pre-flight: shared-interface rows

- T2 consumes T1 (Candidate) and adds primaryGenre — clean.
- T3 consumes T1 (Intent, IntentEcho); produces HardConstraints,
  constraintsFromIntent, PlaceQuery.constraints — CONFLICT, see below.
- T4 consumes T3 (HardConstraints, constraintsFromIntent) — clean.
- T5 consumes T3/T4 (HardConstraints, relaxOnce) + T1 (DIETARY_TAGS) — clean.
- T6 consumes T1 (parseRouteBody) + existing ChatClient, SpendLimiter. clarify.ts
  is a leaf: it imports from loop.ts and tools.ts, neither imports it — clean.
- T7 moves openRanges/parseHour out of score.ts into open-tonight.ts and imports
  them back. open-tonight imports window.ts only — no cycle, clean.
- T8 consumes T1 (VIBE_QUERIES et al) + T3 (HardConstraints) — clean.
- T9 consumes Stop, TimeWindow; build.ts imports narrative.ts — clean.
- T10 consumes T9 (buildNarrative) + orderStops — clean.
- T11 consumes T1 (Intent, vocabulary) — clean.

Pre-flight: CONFLICT — circular import between types.ts and qloo-params.ts
  T3 has providers/types.ts import HardConstraints from intent/qloo-params.ts,
  while qloo-params.ts imports Intent and IntentEcho from providers/types.ts.
  TypeScript erases type-only cycles, so this would compile, but it is a real
  cycle that a bundler or lint rule can reject and that makes the module graph
  a lie.
  Ruling: define HardConstraints in providers/types.ts, where the other
  provider-boundary types live, and have qloo-params.ts import it from there.
  The dependency then runs one way: intent -> providers.
  Cost if wrong: none; it is the same type, declared one file over.

Pre-flight: NOTE — intentEcho arrives in two steps by design
  T3 step 12 adds `intentEcho` to Route and has buildRoute default it to
  `{applied: [], ignored: []}`. T5 step 4 then adds it to BuildInput so the
  endpoint can pass a real one. Not a conflict: T3 ships a working default and
  T5 replaces it with the caller's value.

Task 1: Ruling: HardConstraints declared in providers/types.ts, not
intent/qloo-params.ts as the plan said — applies the pre-flight ruling, so the
module graph runs one way. Cost if wrong: none.
Task 1: Ruling: added a clarified-answer length test the plan put in Task 6,
because the cap lives in this task's schema. Cost if wrong: none; it is tested
where it is implemented.
Task 1: complete (tests: npm test -> 225 pass / 5 skipped; typecheck clean; 13 RouteRequest literals patched across 7 files)

Task 2: FINDING, measured live and load-bearing for Task 4. Of 20 Abuja
results at filter.popularity.max=0.5, only three are places you would go out
to: AJ'S PIZZA (restaurant:pizza), Play Point (restaurant:bar) and C'est la vie
(restaurant:karaoke_bar). The other seventeen are hotels, housing estates,
plazas, a shopping centre, a pharmacy, a phone shop, an eye care centre and a
business networking company. The allow-list is therefore not a nicety: without
it the hidden-gems slider serves pharmacies. With it, the hidden pool is thin
enough that Task 4's relaxation is the only thing that will let three slots
fill. Recorded so Task 3 is not tuned on the assumption that a popularity
ceiling alone gives a usable pool.

Task 2: Ruling: HIDDEN_CEILING stays at 0.5 rather than being loosened to
compensate for the thin pool. A take of 50 at that ceiling yields roughly seven
venues, which can fill three slots, and relaxation covers the cases where it
cannot. Loosening the ceiling instead would quietly reintroduce the malls the
slider exists to avoid. Cost if wrong: more routes relax than ideal, and each
one says so in the echo.

Task 2: Ruling: the `mk` test helpers in quality.test.ts and
review-findings.test.ts now default primaryGenre to null. They spread
FIXTURE_CANDIDATES[0] and override `category`, so inheriting the fixture's
genre made every synthetic candidate a cafe and broke 16 tests. Nulling it lets
those cases exercise the category and tag paths they were written for.
Cost if wrong: none; a test wanting the genre path sets it explicitly.
Task 2: complete (tests: npm test -> 230 pass / 5 skipped; typecheck clean)

Task 3: Ruling: the radius test asserts the '+' form-encoding URLSearchParams
produces, not '%20'. I verified live that Qloo returns identical results for
POINT(7.4913%209.0579) and POINT(7.4913+9.0579), so both decode the same.
Worth checking rather than assuming, given Qloo ignores bad parameters
silently. Cost if wrong: a radius search would silently search the wrong
place; the live check rules that out.
Task 3: VERIFIED LIVE. discovery=0.1 returned Salamander Cafe, Chicken Capitol
and Beer Barn at popularity 0.89-0.98. discovery=0.9 returned Eleven 05 Cafe,
Tulip Bistro and Seven at 0.44, 0.0 and 0.004. Entirely different sets, and the
hidden set is the better evening — which is the whole point.
Task 3: complete (tests: npm test -> 240 pass / 5 skipped; typecheck clean; live differential confirmed)

Task 4: Ruling: added mergeEcho, which the plan did not call for. The live
check returned an echo claiming all three constraints were applied AND that
all three were relaxed — "Budget applied" directly above "Budget could not be
applied". A constraint that was later given up is not an applied constraint,
so the relaxed ones win and duplicate relaxations collapse to one line.
Cost if wrong: none; it is strictly less contradictory.
Task 4: Ruling: I wrote echo.ts and echo.test.ts in one call, skipping RED. I
then stubbed the implementation out, confirmed 3 of the 4 tests fail without
it, and restored. The RED was real, just late.
Cost if wrong: none now; noted because the discipline matters more than the
outcome in this one case.
Task 4: Ruling: session gained setConstraints, not in the plan. Relaxation
replaces the constraints mid-run and the session had captured them at
construction, so the relaxed set never reached the next search. Not
model-facing. Cost if wrong: none; it is a private setter on an internal object.
Task 4: VERIFIED LIVE. hidden + budget 1 + 1km radius in Abuja relaxed all
three in order (radius, hidden gems, budget) and still returned three stops,
with every relaxation named.
Task 4: complete (tests: npm test -> 258 pass / 5 skipped; typecheck clean)

Task 5: Ruling: the requirement downgrade moved from buildRoute to the loop.
  Finding: the session builds the route before any relaxation has happened, so
  it always passed an empty echo and the "dropped requirement means weak
  confidence" rule never fired on the real path — the exact defect this task
  exists to prevent. Reproduced with a loop-level test that returned 'strong'.
  Decided: buildRoute keeps the rule for direct callers, and the loop applies
  it again on return, where the relaxation is known.
  Cost if wrong: the rule is evaluated twice; both agree.

Task 5: Ruling: added src/lib/intent/labels.ts as the single source of
constraint names.
  Finding: constraintsFromIntent labelled a requirement 'Must have' while
  RELAX_LABELS called it 'Must-haves', so mergeEcho could not tell they were
  the same thing. The live run reported 'Must have' applied directly above
  'Must-haves could not be applied'.
  Decided: one record keyed by HardConstraints field, imported by both sides,
  with a test asserting every applied label matches its relaxation label.
  Cost if wrong: none; the drift is now a compile-time key.

Task 5: VERIFIED LIVE. kosher in Abuja returns HTTP 200, three stops,
confidence weak, applied empty and ignored naming Must-haves. Not a 422, and
not a silent substitution.
Task 5: complete (tests: npm test -> 269 pass / 5 skipped; typecheck clean)

Task 6: Ruling: the clarify system prompt was rewritten after a live check.
  Finding: as planned it returned {clear:true} for "something nice", which is
  exactly the vague input the feature exists for. The prompt named the
  threshold abstractly ("would change which Qloo queries you run") and the
  model read it generously.
  Decided: state the test concretely — does the mood name a vibe, a venue kind
  or an occasion? — with four worked examples on each side.
  Re-verified: "something nice" and "surprise me" now ask; "quiet wine bar with
  small plates" and "cocktails and live music" stay clear.
  Cost if wrong: a mood that names one of the three but is still thin passes
  unasked. Better than interrupting somebody who has already said what they
  want.
Task 6: VERIFIED LIVE. The answered path returns a route (HTTP 200,
confidence ok) with the answer in the planner's first message. Review Focus 3
is closed by a test asserting a tag-shaped answer reaches the model as prose
and never becomes a category.
Task 6: complete (tests: npm test -> 282 pass / 5 skipped; typecheck clean)

Task 7: Ruling: openRanges and parseHour moved out of score.ts into
open-tonight.ts and are now imported back, so the card and the score read one
parser. The plan called for this; recording it because it means a change to
opening-hours logic can no longer make the card disagree with the ranking.
Cost if wrong: none; a test asserts the two agree for every case.
Task 7: VERIFIED LIVE. An Abuja route at discovery 0.8 returned photos on all
three stops, ratings, neighbourhoods (Gwarinpa, Jabi), openTonight true, and
real Qloo descriptions.
Task 7: Review Focus 4 closed in a real browser: with images.qloo.com blocked,
the card height goes 162.75 -> 306.75 rather than collapsing, all three names
still render, the detail line survives, no horizontal scroll, clean console.
Task 7: NOTE, not fixed: business_rating arrives as a float32 artefact
(4.199999809265137). The card renders it through toFixed(1) so a person sees
4.2. Left as-is rather than rounded at the boundary, because the raw value is
what Qloo said.
Task 7: complete (tests: npm test -> 290 pass / 5 skipped; typecheck clean; 6/6 browser checks)

Task 8: Ruling: the empty-pool rescue is now UNTAGGED.
  Finding: it retried `session.requestedTagIds`, which after preference
  seeding are the very tags whose search returned nothing. Retrying them
  failed the same way, and a preference-only request could end in "No places
  have been gathered yet". Found by a test asserting preference labels reach
  the echo, which failed on the error instead.
  Decided: when the pool is empty, search with no tags at all.
  Cost if wrong: the rescue route is less mood-matched. A complete route beats
  an error, which is already this codebase's position.

Task 8: Ruling: five fixture candidates gained ambience, occasion and
customer_identity tags. Real Qloo places carry them and ours did not, so a
preference search matched nothing in tests while working live. Still
hand-written, mirroring the URNs observed on the host.
Cost if wrong: none; it makes the fixtures more like the thing they stand in for.

Task 8: Ruling: the endpoint merges BOTH halves of the applied list.
  Finding: the live echo came back empty even though the preferences had
  visibly changed the route. The loop put the preference labels on the route
  and the endpoint then overwrote the echo with the constraint labels alone.
  Decided: merge the constraint labels with whatever the loop already
  attached. Cost if wrong: a label could appear twice; mergeEcho dedupes the
  ignored side and the applied side is keyed by distinct constraint names.

Task 8: VERIFIED LIVE. quiet + intimate + first date + couple + budget 3 in
Abuja reports all four labels and returns Salamander Cafe, Puzzo's and New
Yorker Wuse. A plain dinner request returns a different set.
Task 8: NOTE: one live call failed with "Connection error" from OpenRouter and
succeeded on retry twenty seconds later. Known flakiness, already covered by
completeWithRetry; not a regression.
Task 8: complete (tests: npm test -> 300 pass / 5 skipped; typecheck clean)

Task 9: Ruling: Route gained narrativeWindow, as the plan anticipated, so a
swap in Task 10 can rebuild the narrative without the original request.
Cost if wrong: one redundant field on the route.
Task 9: complete (tests: npm test -> 310 pass / 5 skipped; typecheck clean)

Task 10: Ruling: the anchor for scoring alternatives is derived in buildRoute
from the chosen main stop, not from fillFrom's local. The plan's snippet
referenced `anchor` in a scope where it does not exist, which threw
ReferenceError on all 12 tests. main is filled first, so its coordinates ARE
the anchor the route clustered around. Cost if wrong: none; same value.
Task 10: complete (tests: npm test -> 322 pass / 5 skipped; typecheck clean)

Task 11: complete (tests: npm test -> 331 pass / 5 skipped; typecheck clean).
A stale, wrong-typed or unparseable blob is discarded whole rather than loaded
half-valid, which is Review Focus 5.

Final review: fresh reviewer (Opus) on ad09627..f5b5389. It ran the suite
itself and made ~12 read-only live probes, which is how it found C1. Re-graded
by effect: C1-C3 and I1-I10 enter the fix pass; minors deferred.

Final: fixed #C1 CRITICAL filter.tags UNIONS by default, so two requirements
  meant neither was enforced while the app reported both as applied. Confirmed
  independently: halal + wheelchair entrance returned Shoprite, MK Curtains
  and Ceddi Plaza, none halal; with operator.filter.tags=intersection it
  returned BluCabana, Domino's, Jevinik and Metrocafe, all halal AND
  accessible. Now sends intersection whenever requiredTags is non-empty, and
  relaxOnce gives up ONE required tag at a time (accessibility before dietary,
  since Qloo tags accessibility sparsely) rather than the whole set.
  3 provider tests + 4 relax tests RED->GREEN.

Final: fixed #C2 CRITICAL the sample-data path computed the constraints and
  then discarded them, returning confidence "strong" with an empty echo. A
  person asking for halal with no key configured got three Lagos fixtures and
  no indication anything had been ignored. Added degradedEcho, which reports
  every stated constraint as unhonourable, and buildRoute now treats any
  ignored constraint on the fixture path as weak. The no-key case also gets a
  notice, which it previously lacked. 4 tests RED->GREEN.

Final: fixed #C3 CRITICAL listSavedRoutes was a bare cast over localStorage
  with an unchanged storage key, so a route saved before intentEcho, narrative,
  narrativeWindow and alternativesBySlot existed came back missing fields the
  UI reads, and blanked the page via error.tsx. Every row now goes through
  routeShape.safeParse; defaults repair what they can and the rest is dropped,
  the same policy as loadPreferences. 5 tests RED->GREEN.

Final: fixed #I3 IMPORTANT relaxation fired on slot-coverage failure, before
  backfill, and chewed through every requirement. The live trace proved it: the
  intersection returned THIRTY conforming places and finalize failed only for
  want of a cafe and a bar, after which the loop dropped both the wheelchair
  and the halal requirement. backfillSlots now runs first, searching each
  missing kind WITH the constraints applied; relaxation is reached only after
  that, where a constraint really is the cause. 2 tests RED->GREEN.
  My first attempt at this reorder moved the relaxation block after an early
  return, making it dead code. Caught by four failing tests; the region was
  rewritten rather than patched further.

Final: fixed #I3-adjacent mergeEcho deduped `ignored` on label alone, so two
  separate requirement drops collapsed into one line and a person could not
  see that their dietary need had gone as well as their accessibility one.
  Now keyed on label and reason. 1 test RED->GREEN.

User request mid-run: "it should pick the person location". Added `here` to
the intent — a position from the browser's Geolocation API, used as the radius
centre instead of resolving a city centre from Qloo's top result.
  coordsSchema rejects off-globe values and 0,0 specifically, because 0,0 is
  also the internal "centre not yet resolved" placeholder and letting it
  through would be indistinguishable from a bug.
  The control asks only when the person clicks, and every refusal path —
  denied, unsupported, timed out — falls back to the whole city with a plain
  message rather than blocking.
  Ruling: `here` is NOT persisted. savePreferences already destructures a
  fixed allow-list that never included it, so the test I wrote for this
  passed without a code change — it is a regression guard, not a RED->GREEN.
  Recording that rather than claiming a fix I did not make.
  Cost if wrong: none; where somebody was last night is not a preference.
  VERIFIED LIVE: a point in Wuse II with a 1.5km radius returned three Wuse II
  venues with 2 and 4 minute walks, and the echo read "within 1.5km of where
  you are". Far tighter than the city-centre path.

Final: fixed #I1 IMPORTANT `avoid` passed raw words into
filter.exclude.tags, which is a measured no-op, while reporting "Avoiding —
hookah" as applied. Added resolveAvoidTags, which resolves each term through
/v2/tags and reports any term Qloo has no tag for in `ignored` instead of
silently doing nothing. 6 + 2 tests RED->GREEN.

Final: fixed #I2 IMPORTANT `step_free` mapped to
wheelchair_accessible_parking_lot — a car park says nothing about step-free
entry, and that is the silent substitution the spec forbids. Qloo publishes no
step-free tag (a query returns parking and wifi), so the option is gone and
the vocabulary now offers exactly the five wheelchair tags Qloo does publish:
entrance, restroom, seating, elevator, parking. 1 test RED->GREEN.

Final: fixed #I4 IMPORTANT accessibility requirements, "places you already
like" and "rather avoid" had no UI at all — a wheelchair user could not state
the need through the product. Added accessibility chips beside the dietary
ones and a reusable ChipListInput for the two free-text lists.

Final: improved explainability coverage — the provider kept Qloo's NARROWEST
tier per seed (top3) and discarded top10 and all. Every tier is true, so it
now keeps the widest: a candidate Qloo says the seed influenced in the top ten
is genuinely explained by it. 2 tests RED->GREEN.

Final: UNRESOLVED, reported not hidden. `intent.seedPlaces` is wired to
dispatch `seed_entities` before the first search, and that path is unit-tested
(2 tests, including the not-found report). It does NOT fire on the live dev
server: `seed_entities` never appears in the trace, and `ignored` stays empty,
for a request whose body carries seedPlaces and whose parse is covered by a
passing test. I restarted the server to rule out stale code and it still did
not fire. I have not isolated the cause and am not claiming the feature works
end to end. Cost if wrong: "places you already like" is enterable in the UI
and may do nothing, which is the same defect class as #I1 — so it must be
resolved or the field removed before submission.

Final: RESOLVED, the unresolved item above. seedEntities was throwing on a
perfectly good /search response, and the throw was swallowed, so naming a
place you liked silently did nothing and no trace entry appeared.
  Cause: /search returns a different entity shape from /v2/insights — `types`
  rather than `type`, differently shaped tags, fields neither schema
  describes — and qlooSearchSchema validated the WHOLE entity against the
  insights schema. seedEntities needs exactly two fields.
  Fixed: a minimal searchHit schema requiring only entity_id and name, and the
  loop now reports a seed-lookup failure in `ignored` instead of swallowing it.
  3 provider tests RED->GREEN.
  VERIFIED LIVE: seed_entities is now the first trace entry and a stop reads
  "Qloo links this to BluCabana Restaurant & Cafe" — Qloo's own explainability
  surfacing in the product for the first time.
  Found by: the avoid fix firing live while the seed path did not, which
  isolated it to a swallowed throw rather than stale code or bad parsing.

Final: fixed a false report in my own new code — the seed name match was
exact, so Qloo answering "BluCabana" with "BluCabana Restaurant & Cafe" was
reported as not found. Now matches loosely in either direction.
1 test RED->GREEN.

Final: fixed I5 — a swapped-in stop lost its opening-hours warning. The stops
got `openTonight` injected at build time; the alternatives were raw pool
candidates, so a swap replaced a card reading "closes before your window"
with a card that said nothing at all.
  2 swap tests RED->GREEN, suite 397/397.

Final: fixed I8 — the alternatives were filtered against the three stops that
existed at build time and never recomputed, so two swaps could put two
lounges in one evening.
  Ruling: the repro uses a crafted six-place pool, not the fixture. Every
  fixture candidate maps to exactly one slot and shares no category across
  slots, so the fixture cannot reach this state; the live-data route to it is
  a venue Qloo classifies as a restaurant whose own category reads "lounge".
  Cost if wrong: nothing — the invariant is pinned either way, but the test
  reads as contrived to anyone who has not seen that data.
  2 swap tests RED->GREEN, suite 397/397.

Final: fixed I9 — every Qloo 400 was reported as an unknown city and was
terminal. Measured live: the body is {"errors":[{"message","path"}]}, and an
unresolvable city differs from a parameter we built wrong only in there.
  Ruling: an unreadable or unrecognised 400 body is now QlooRequestError, not
  UnknownLocalityError. Cost if wrong: if Qloo rewords its locality error, a
  genuinely unknown city gets the vaguer "Qloo rejected the search" message
  instead of "try a larger nearby city" — a worse message, never a false one,
  which is the right direction to fail in.
  4 provider tests RED->GREEN, suite 397/397.

Final: fixed I6 — budget.
  Ruling: implemented rather than amended away, against what I had told
  Christopher I would do. `price_level` is now carried onto the candidate and
  route building excludes any place whose published level exceeds the stated
  ceiling, whether or not the Qloo filter survived relaxation. The spec's
  promise "a stated ceiling never produces a stop known to exceed it" is a
  truthfulness property of the same class as C1, so it was worth keeping
  rather than deleting. Cost if wrong: a stated ceiling now also excludes a
  place just over the cap that somebody might have accepted, with no way to
  say so.
  Ruling: the spec's "relaxed to a scoring preference" is amended away, not
  implemented. Ranking on a field four places in five lack would rank by
  whether Qloo published the data and present that as a response to what the
  person asked for. Cost if wrong: budget has no influence at all on the
  ordering of places that publish no price, which is most of them.
  Ruling: `priceLevel` is an optional top-level Candidate field, not a
  required one. Required would have churned roughly forty test literals for
  no behavioural gain. Cost if wrong: a provider that forgets to set it reads
  as "price unknown" rather than failing the typecheck.
  2 provider tests + 2 build tests RED->GREEN, suite 397/397.

Final: fixed I10 — seven live tests for the paths the richer-intent work
added, in qloo.live.test.ts, skipped without a key. The first asserts that
two required tags INTERSECT: that is the test that would have caught C1, and
no mock could ever have caught it.
  Ruling: the live explainability test asserts `appliesTo` is EMPTY at the
  provider layer, because the session is the only place that still holds the
  candidate list the block was computed against and tools.ts fills it there.
  Cost if wrong: if that responsibility ever moves into the provider, this
  test pins the old layering and must move with it.
  12 live tests pass against the hackathon host.

Final: minor (deferred): the raw provider error in console.error may carry a
partial key.
Final: minor (deferred): swapStop keeps the old route.id, so saving a swapped
route overwrites the original rather than saving beside it.
Final: minor (deferred): a broken image leaves a 144px blank band on the card.
Final: minor (deferred): the form stays submittable while a clarifying
question is pending.
Final: minor (deferred): the discovery slider shows 0.5 while a chosen
persona actually applies 0.75, 0.6 or 0.4.
Final: minor (deferred): CONSTRAINT_LABELS.demographics is unreachable, since
demographics are deliberately never pushed to `applied`.
Final: minor (deferred): the next.config.ts image allow-list is dead config.

Final: fix pass complete. C1-C3 and I1-I10 all fixed and committed. Suite
397/397 unit, 12/12 live, typecheck clean.
