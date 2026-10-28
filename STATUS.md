# TasteRoute status

Last updated: 28 October 2026 (desktop layout, plan clock, price bands, presets).

## Where it stands

The whole product is built and tested: engine, Qloo adapter, agent loop, API,
mobile UI, save and share — plus the richer intent work: a discovery slider,
hard requirements, a clarifying question on its own endpoint, photo-and-rating
stop cards, vibe/occasion/party/demographic signals, a narrative, stop
swapping, remembered preferences, and "use my location" as the radius centre.

471 unit tests pass, 12 live Qloo tests pass with a key, typecheck is clean,
`next build` succeeds, and 16 browser checks pass at phone width.

Since the review the app also: lays itself out for a desktop as well as a
phone; prints an estimated clock down the plan, worked out from the hours and
the walks and labelled as an estimate, not a booking; says what Qloo's 1-4
price band is for the stops it priced, and how many of them that was; and
offers four presets that fill the mood, the hours and the matching options in
one tap. A share link no longer carries the swap lists, which had grown it to
a quarter of a megabyte — long enough that servers refuse the URL.

Every finding from the whole-branch review is fixed: three Critical and ten
Important. The three that mattered most were all the same fault — the app
telling somebody a constraint had been applied when it had not:

- `filter.tags` unions by default, so halal AND wheelchair access returned
  places with neither while both were reported as applied. Now sent with
  `operator.filter.tags=intersection`, and requirements are given up one at a
  time rather than as a set.
- The sample-data path discarded every computed constraint and still reported
  strong confidence.
- A budget ceiling vanished the moment the Qloo filter was relaxed, because
  `price_level` never reached the candidate. Our own code now holds the
  ceiling on the price levels Qloo does publish.

All seven deferred minor findings are now fixed; the ledger records each
one and what closed it. Two were UI-only one-liners with no test, because
this repo has no DOM test environment and adding one for them was not
worth the risk this close to submission.

It has been run end to end against live Qloo and a live model many times and
returns real routes with real evidence.

## Hosted demo

https://tasteroute-sepia.vercel.app — deployed 24 Oct, verified returning live Qloo routes with strong
confidence. Public, no Vercel authentication wall.

## Blocking the submission

1. **Deploy the current code.** `main` is at the two commits that fixed the
   review findings and the seven minors; the hosted demo above still serves
   the 24 Oct build. Run `npx vercel deploy --prod --yes` from the repo root.
2. **Record the 3-minute video.** The shot-by-shot script, with the exact
   narration and the things not to claim, is in `docs/demo-video-script.md`.
3. **Paste the Devpost form** from `docs/submission.md`, plus the repo URL
   and the demo URL.

OpenRouter credit is not blocking: $4.99 of the $5 weekly limit was
remaining on 26 Oct, resetting 2 Nov, and a route costs about $0.006.

## Commands

```bash
npm install
npm test                                  # unit tests, no network
npm run typecheck
npm run build
npm run dev                               # port 3000, or -p if taken

# live Qloo tests (skipped without a key)
set -a && . ./.env.local && set +a && npx vitest run src/lib/providers/qloo.live.test.ts

# one end-to-end route
curl -s -X POST localhost:3000/api/route -H 'content-type: application/json' \
  -d '{"city":"Abuja","mood":"cocktails and live music","startHour":18,"endHour":23}'
```

## Decisions taken in the richer-intent work

- **Requirements are not preferences.** Dietary needs, accessibility needs,
  budget and area are hard Qloo filters applied by our code, out of the
  agent's reach. Vibe, occasion, party and persona are weighted signals.
- **A requirement that cannot be met is reported, never dropped quietly**, and
  the route reports weak confidence.
- **Venue kinds are an allow-list read from `primary_genre`.** The obscure end
  of Qloo's catalogue is housing estates and pharmacies; a deny-list cannot
  keep up.
- **The clarifying question lives on `/api/clarify`**, so `/api/route` stays
  single-phase with its contract and tests intact, and the feature can be
  removed by deleting one handler and one component.
- **Age and gender are never stored, logged, or echoed back** — not even in
  the browser.

## Decisions taken

- **Model access goes through OpenRouter.** TechClave's own `OPENAI_API_KEY`
  returns 401; the OpenRouter key works. The code uses the OpenAI SDK with
  `baseURL`, so switching back is one environment variable.
- **Model is `openai/gpt-5-mini`**, with `openai/gpt-5-nano` as the cheap
  fallback.
- **Demo city is Abuja.** Measured across Abuja, Lagos, Accra and Nairobi with
  the same mood: Abuja gave strong confidence and 19- and 4-minute walks;
  Lagos gave weak confidence, malls and fast food.
- **The agent cannot choose the stops.** It picks the Qloo queries; scoring,
  ordering and reasons are pure functions. A test asserts no tool parameter
  accepts a stop selection.
- **Fixtures are hand-written, never captured Qloo responses**, so no Qloo
  response data enters the public repo.
- **A venue gets exactly one slot**, decided by category first then genre tags.
  Offering tags are ignored, because a hotel that serves coffee is not a cafe.

## Qloo API facts worth not rediscovering

See the "What we learned about the Qloo API" section of the README. The two
that cost the most time: explainability only works with entity signals, and
invalid parameters are silently ignored rather than rejected.

## Remaining submission steps

- [x] Deployed, with the five environment variables set on Vercel
- [x] Live URL recorded in README.md and docs/submission.md
- [ ] Paste the live URL into the Devpost form
- [x] Pushed to https://github.com/cemek7/tasteroute, public, MIT detected in About
- [ ] Paste `docs/submission.md` into the Devpost description
- [ ] Top up OpenRouter credit
