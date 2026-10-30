# TasteRoute

Say the mood and the hours. Get a plan of three to five stops, in order, with the reason for each one.

TasteRoute turns a mood, a city and a pair of hours into a plan of three to
five stops — a morning, a day out, an evening, or a night that ends in a
club. An agent decides which questions to ask [Qloo's Taste AI](https://qloo.com); TasteRoute
decides what the answer is. Scoring, stop order and reason text are all
computed from Qloo's own fields, never generated.

**Live demo:** https://tasteroute-sepia.vercel.app

## What makes it Qloo-powered

Remove Qloo and nothing works. Specifically:

- **A mood becomes real taste tags.** The agent calls `/v2/tags` to turn
  "low-key but not dead" into actual Qloo tag URNs such as
  `urn:tag:genre:place:restaurant:cocktail_bar`. There is no hardcoded mood
  table anywhere in the codebase.
- **Candidates come from `/v2/insights`** with those tags as taste signals,
  scoped to the city's locality, and ranked partly on Qloo's own `affinity`.
- **Every reason cites a Qloo field.** Matched tag names, the affinity score,
  `good_for`, `ambience_description`, and Qloo's own `explainability` block
  when the query was seeded with entities. A stop with no Qloo signal is
  labelled *unexplained* rather than given an invented rationale — that rule is
  enforced by a test, not by convention.
- **Weak signal is reported, not hidden.** When Qloo returns too little, the
  route says which part of the evening was thin and offers the other places it
  found.

## What you can tell it

City, mood and the hours are the only required inputs; a route comes back
without touching anything else. Four presets — date night, food crawl, a day
out, big night — fill the mood, the hours and the matching options in one tap,
because the hours are the input people under-use and they are what decides
whether the plan has a breakfast or a club in it. The options panel below adds the rest,
and whatever you set is echoed back above the route — including anything that
could not be applied, and why.

**Applied by our code, out of the agent's reach.** These are constraints, not
leanings, so a better taste match can never outvote them:

| You say | Qloo parameter |
|---|---|
| famous ↔ hidden gems | `filter.popularity.min` / `.max` |
| a budget | `filter.price_level.max`, and a ceiling our own code holds |
| stay within 1/3/10km, of the centre or of where you are | `filter.location=POINT()` + `filter.location.radius` |
| halal, vegetarian, vegan, gluten-free, kosher | `filter.tags` with `operator.filter.tags=intersection` |
| wheelchair entrance, restroom, seating, lift, parking | `filter.tags` with `operator.filter.tags=intersection` |
| things to avoid | `filter.exclude.tags` |

**Interpreted by the agent, as weighted signals.** These are leanings, and the
agent resolves each one by querying Qloo's tag vocabulary at runtime rather
than from a table in this repo:

| You say | Resolved to |
|---|---|
| a vibe: lively, quiet, intimate, upscale, casual, outdoor | `urn:tag:ambience:qloo:*` |
| an occasion: first date, birthday, anniversary… | `urn:tag:event:place:*`, `urn:tag:good_for:qloo:*` |
| who you are going with | `urn:tag:customer_identity:qloo:*`, `urn:tag:good_for:qloo:*` |
| new to the city, a local, visiting | sets the hidden-gems default |
| age and gender, if you want to | `signal.demographics.age` / `.gender` |
| places you already like | `signal.interests.entities` — the only path that yields Qloo's own explainability |

**When they cannot all hold.** Hidden gems plus a tight budget plus a 1km
radius can intersect to nothing. Rather than refuse, TasteRoute gives up one
at a time — area first, then the popularity band, then the budget, and a
stated dietary or accessibility need last — and names each one it dropped. A
route that could not honour a stated need reports weak confidence.

Age and gender are never stored, never logged, and never echoed back. They are
not kept in the browser either.

## How the agent is bounded

The agent chooses which mood words to resolve, which tags to pursue, whether to
widen the search, and when to stop. It has four tools: `find_tags`,
`seed_entities`, `suggest_places` and `finalize_route`.

It cannot choose, score or order the stops, and it does not write the reasons.
Those are pure functions with unit tests. No tool parameter accepts a stop
selection, and a test asserts that against the tool schemas.

Everything else is TasteRoute's responsibility, including the parts the model
gets wrong:

- the model has been observed resolving tags repeatedly and never searching, so
  the loop nudges it and then rescues the run itself
- the model searches on taste, which can return only bars, so unfilled slots
  are backfilled with canonical queries
- the model is capped at six tool rounds, because the demo URL is public
- before planning, a separate `/api/clarify` call lets the model ask **one**
  question when the mood names no vibe, venue kind or occasion — "something
  nice" gets asked, "quiet wine bar with small plates" does not. It always
  offers choices, is always skippable, and every failure path answers "clear"
  rather than standing between you and a route

The planner trace is visible in the UI, so you can see every tool call it made
and how long each took.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm test                     # 476 tests, no network needed
npm run dev
```

Environment variables are listed in `.env.example`. A Qloo hackathon key is
required for live data; without one the app serves clearly labelled sample
routes rather than failing.

`OPENAI_BASE_URL` lets the OpenAI SDK point at an OpenAI-compatible endpoint
such as OpenRouter. Leave it unset to talk to OpenAI directly.

## Tests

```bash
npm test          # unit tests, no network
npm run typecheck
```

476 unit tests, and 12 live tests that check the claims this README makes
about Qloo — including that two required tags intersect rather than union,
which is the one claim no mock could ever have verified.

The live tests in `src/lib/providers/qloo.live.test.ts` run only when
`QLOO_API_KEY` is set, and are skipped otherwise:

```bash
set -a && . ./.env.local && set +a && npx vitest run src/lib/providers/qloo.live.test.ts
```

## What we learned about the Qloo API

Recorded because the docs do not say it and each one cost a debugging round:

- `feature.explainability` only computes for `signal.interests.entities`. With
  `signal.interests.tags` it returns `warnings: [{type: "Could not calculate
  explainability"}]` and no explainability block.
- Absent properties come back as explicit `null`, not omitted keys.
- `properties.good_for` is an **array of tag objects**, not a string.
- `properties.live_music` is a **boolean**, not a description.
- `properties.hours` is a weekday map of
  `[{opens: "T17:00:00" | null, closed: boolean, closes: "T23:30:00" | null}]`.
- Genre URNs nest, so a cocktail bar is
  `urn:tag:genre:place:restaurant:cocktail_bar` — matching on the substring
  `restaurant` will put every bar in your dinner slot.
- Invalid parameters are **silently ignored** and still return 200, so this
  codebase validates every outbound parameter name against an allowlist before
  the request is built.
- `take` is capped at 50.
- `properties.primary_genre` is one clean URN per place and a far better
  classification than parsing the tag list. Slot assignment reads it.
- The default answer for a city is its **most famous** places: Abuja comes
  back at popularity 0.984–0.997. `filter.popularity.max=0.4` returns a set
  with **zero overlap**. Hidden gems is one parameter away.
- The obscure end of the catalogue is housing estates, car parks, pharmacies
  and phone shops. Of 20 Abuja results below 0.5 popularity, three were places
  you would go out to — so venue kinds are an allow-list, not a deny-list.
- **`filter.tags` is a UNION by default.** Asking for halal AND a wheelchair
  entrance returns places with either, or with neither. Two requirements come
  back as a supermarket and a curtain shop unless you send
  `operator.filter.tags=intersection`. This cost a fortnight of the app
  reporting both needs as applied while honouring neither; the live test for
  it is the first in `qloo.live.test.ts`.
- `properties.price_level` is present on about one place in five, so a budget
  used as a hard filter discards most of a city. The Qloo filter relaxes
  rather than emptying the pool, and our own code still refuses any place
  whose published level exceeds the ceiling. A place with no price level is
  unknown, not cheap, and stays in.
- A bad request answers 400 with `{"errors":[{"message","path"}]}`. An
  unresolvable city and a parameter you built wrong differ only in there, so
  the body is the only way to avoid telling somebody their city does not
  exist.
- `signal.demographics` genuinely changes results: the same Abuja restaurant
  query returns Transcorp Hilton with no demographics, City Park for
  `age=24_and_younger`, and 355 Steakhouse for `gender=female`.
- `properties.images` arrives as objects carrying a url, and sometimes as bare
  url strings.
- `filter.location` accepts WKT `POINT(lng lat)`, and Qloo decodes a `+` and a
  `%20` identically there.

## Deploying

The demo must be publicly reachable to qualify for the hackathon.

```bash
vercel login     # interactive, run this yourself once
npx vercel deploy --prod
```

Then set `QLOO_API_BASE_URL`, `QLOO_API_KEY`, `OPENAI_BASE_URL`,
`OPENROUTER_API_KEY` and `TASTEROUTE_MODEL` as Vercel environment variables.
Never commit a key.

## Known limits

- Qloo's catalogue for some cities leans towards malls, hotels and fast food
  rather than curated nightlife. Of the cities tried, **Abuja** returns the
  strongest coverage and the most walkable routes, so it leads the city list.
  Where the data is thin the route says so instead of pretending.
- Distance is weighed, not enforced. A candidate within 3km of the plan's
  anchor earns proximity credit; past that the credit is gone and a penalty
  grows with the extra distance, capped at 0.3 of the score. A city whose
  venues are genuinely spread out still gets a plan — it will just have long
  legs, and the card says "worth a taxi" when a walk passes 30 minutes.
- A venue gets one slot. A restaurant that becomes a bar late can only be one
  stop, which is also what guarantees a place cannot appear twice.
- We do not ask which day you are going out, so a venue open only on Mondays
  counts as open.
- A budget can only exclude places that publish a price level, and most do
  not. Measured against the live host on 28 Oct 2026, over 40 places each:
  Abuja 11, Lagos 4, Nairobi 2. So the plan's price line names the band and
  how many stops it covers — "mid-range where Qloo has a price, 2 of 3" —
  and says nothing at all when Qloo priced none of them.
- Qloo also publishes `price_range`, but where it is populated it carries
  hotel nightly rates in dollars, so the app does not show it. There is no
  menu, no dish price and no currency anywhere in Qloo's place data.
- The clock down the plan is arithmetic, not a reservation: the hours you
  gave, the walk between each pair of stops, and a typical length for each
  kind of stop. The page says so under the plan. Tight hours shorten the
  stops rather than pushing the plan past the end you chose.
- There is no step-free tag in Qloo's vocabulary — a query for it returns
  parking and wifi — so the product does not offer one. The five wheelchair
  tags Qloo does publish are offered instead.

## Licence

MIT. See [LICENSE](./LICENSE).
