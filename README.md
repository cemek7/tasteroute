# TasteRoute

Say the mood. Get three stops, in order, with the reason for each one.

TasteRoute turns a mood and a city into a three-stop evening out. An agent
decides which questions to ask [Qloo's Taste AI](https://qloo.com); TasteRoute
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

The planner trace is visible in the UI, so you can see every tool call it made
and how long each took.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm test                     # 156 tests, no network needed
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

The live Qloo tests in `src/lib/providers/qloo.live.test.ts` run only when
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
- A venue gets one slot. A restaurant that becomes a bar late can only be one
  stop, which is also what guarantees a place cannot appear twice.
- We do not ask which day you are going out, so a venue open only on Mondays
  counts as open.

## Licence

MIT. See [LICENSE](./LICENSE).
