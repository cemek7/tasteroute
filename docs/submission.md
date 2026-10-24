# Devpost submission text

## Project name

TasteRoute

## Tagline

Say the mood. Get three stops, in order, with the reason for each one.

## What it does

TasteRoute turns a mood and a city into a three-stop evening out: where to
start, where to eat, where to finish, in walking order, with a reason attached
to each stop that you can check.

You type something like "low-key but not dead, somewhere with live music" and
pick a city. An agent then works out what that means in Qloo's taste graph —
which tags to resolve, which to search on, whether the results are good enough
or need widening — and TasteRoute assembles the route from what comes back.

Every stop shows why it is there, and every reason traces to a Qloo field: the
tags that matched, the affinity score, what the place is good for, and Qloo's
own explainability when the search was seeded with a place you already like. If
Qloo has little to work with, the app says so and shows the other options
instead of bluffing.

## What makes it Qloo-powered

Remove Qloo and there is no product left.

- The mood becomes **real Qloo tag URNs** via `/v2/tags`. There is no hardcoded
  mood table in the codebase; the agent discovers the vocabulary each time.
- Candidates come from **`/v2/insights`** with those tags as taste signals,
  scoped to the city's locality, and are ranked partly on Qloo's `affinity`.
- Reasons are **assembled from Qloo's fields**, not written by a language
  model. A place with no Qloo signal is labelled unexplained rather than given
  an invented rationale, and a test enforces that.
- Seeding with `signal.interests.entities` unlocks Qloo's **explainability**
  block, which is the strongest reason the app can show: "Qloo links this to
  the place you named."

## What you can tell it

City, mood and the hours are all that is required. A collapsed panel adds a
famous-to-hidden-gems slider, a budget, how far you will walk, who you are
going with, what the night is for, the vibe, dietary and accessibility needs,
places you already like, and — optionally — your age and gender.

The split that matters: **requirements are not preferences.** A dietary or
accessibility need, a budget ceiling and an area limit become hard Qloo
filters applied by our code, where no taste match can outvote them. Vibe,
occasion and party become weighted signals the agent resolves by querying
Qloo's tag vocabulary at runtime. When they cannot all hold, TasteRoute gives
up one at a time — area first, a stated dietary need last — and tells you
exactly what it dropped.

The highest-value single control is the discovery slider. Qloo's default
answer for a city is its most famous places; Abuja comes back at popularity
0.984 and above, which is how early routes became a mall and a Domino's. Ask
for hidden gems and you get a set with zero overlap. That one parameter is the
difference between a tourist trap generator and the product.

## Before it plans, it may ask you one question

If the mood names no vibe, no venue kind and no occasion — "something nice",
"fun", "surprise me" — the agent asks a single question with two to four
concrete choices and a reason that says what it would change. "quiet wine bar
with small plates" is never interrupted.

That is the clearest demonstration of agency in the product: the model is not
choosing stops, it is deciding whether the intent it has been given is
sufficient to act on. It is always skippable, and every failure path proceeds
to planning rather than blocking.

## The interesting design decision

The hackathon asks for an agent. A product needs ordering you can defend. So
the agent's authority is bounded: it decides *what to ask Qloo*, and our code
decides *what the answer is*.

The agent has four tools and none of them accepts a stop selection. Scoring,
slot assignment, walking order and reason text are pure functions with unit
tests, so the same pool always produces the same route. The agent handles the
part that genuinely needs judgment — interpreting "low-key but not dead" — and
nothing else.

The planner trace is visible in the UI. You can see every Qloo call the agent
made, in order, with timings. That is both the honesty mechanism and the proof
that the thing is really agentic.

TasteRoute also covers for the model where it has to. In live runs the model
sometimes resolved tags repeatedly and never searched; sometimes it searched
only its mood tags and came back with nothing for one part of the evening. A
three-stop route needs all three kinds of place, so the loop nudges, rescues
and backfills rather than handing the user an error.

## How it was built

Next.js with TypeScript, Tailwind for a mobile-first layout, the OpenAI SDK for
the agent loop, Zod at the Qloo boundary, and Vitest for 156 unit tests that
run with no network at all.

Qloo sits behind a `TasteProvider` interface with a hand-written fixture
implementation, which is what made the engine testable and lets the deployed
app fall back to clearly labelled sample routes rather than erroring when a key
is missing.

## What we learned about the Qloo API

Each of these cost a debugging round and none is in the docs:

- `feature.explainability` only computes for entity signals. With tag signals
  it returns a warning and no explainability block.
- Absent properties come back as explicit `null`, not omitted keys.
- `good_for` is an array of tag objects; `live_music` is a boolean; `hours` is
  a weekday map of open/close time strings.
- Genre URNs nest, so a cocktail bar is
  `urn:tag:genre:place:restaurant:cocktail_bar`. Match on the substring
  "restaurant" and every bar lands in your dinner slot.
- Invalid parameters are silently ignored and still return 200. TasteRoute
  validates every outbound parameter name against an allowlist before building
  the request, because a typo would otherwise return a confident 200 for a
  query that did something else.

## Built with

qloo, nextjs, typescript, react, tailwindcss, zod, vitest, openai, vercel

## Try it out

- Live demo: https://tasteroute-sepia.vercel.app
- Repo: https://github.com/cemek7/tasteroute
