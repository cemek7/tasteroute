# TasteRoute status

Last updated: 24 October 2026 (richer intent shipped).

## Where it stands

The whole product is built and tested: engine, Qloo adapter, agent loop, API,
mobile UI, save and share — plus the richer intent work: a discovery slider,
hard requirements, a clarifying question on its own endpoint, photo-and-rating
stop cards, vibe/occasion/party/demographic signals, a narrative, stop
swapping, and remembered preferences.

333 unit tests pass, 5 live Qloo tests pass with a key, typecheck is clean,
`next build` succeeds, and 16 browser checks pass at phone width.

It has been run end to end against live Qloo and a live model many times and
returns real routes with real evidence.

## Hosted demo

https://tasteroute-sepia.vercel.app — deployed 24 Oct, verified returning live Qloo routes with strong
confidence. Public, no Vercel authentication wall.

## Blocking the submission

1. **OpenRouter credit was $4.79** when measured on 23 Oct, and each route
   costs roughly $0.006. Worth topping up before judging.

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
