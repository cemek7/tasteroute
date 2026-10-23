# TasteRoute status

Last updated: 23 October 2026.

## Where it stands

The whole product is built and tested: engine, Qloo adapter, agent loop, API,
mobile UI, save and share. 156 unit tests pass, 5 live Qloo tests pass with a
key, typecheck is clean, `next build` succeeds, and 6 browser checks pass at
phone width.

It has been run end to end against live Qloo and a live model many times and
returns real routes with real evidence.

## Blocking the submission

1. **Not deployed.** `vercel whoami` reports logged out, and `vercel login` is
   interactive. Christopher must run it once. The hosted demo is pass/fail for
   the hackathon.
2. **Repo is local only.** It must be public, with the licence visible in the
   GitHub About section.
3. **OpenRouter credit was $4.79** when measured on 23 Oct, and each route
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

- [ ] `vercel login`, then deploy, then set the five environment variables
- [ ] Put the live URL into README.md and the Devpost form
- [ ] Push to a public repo, licence visible in About
- [ ] Paste `docs/submission.md` into the Devpost description
- [ ] Top up OpenRouter credit
