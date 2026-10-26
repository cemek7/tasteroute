# TasteRoute — 3-minute demo video script

Target length 2:55. Shot on a phone-width browser window (the app is
mobile-first). Everything below is spoken over screen capture; there is no
talking head.

## Before you record

- Open https://tasteroute-sepia.vercel.app in a fresh window, phone width.
- Clear site data, so the options panel starts empty.
- Check the OpenRouter key has credit. A failed plan on camera is a retake.
- Plan each of the two routes once before recording, so Qloo's results are
  warm and you know what is going to come back.

## On the waits

A plan makes several Qloo calls and one model round, and the app says so:
"The planner makes several Qloo calls. This takes up to a minute." Do not
pretend it is instant. Speed the waiting footage up and put `8× speed` in the
corner while it runs. A judge who sees a labelled speed-up trusts the rest of
the video; one who suspects a cut does not.

## Script

**0:00 – 0:16 — What it is**

> Give TasteRoute a city, a mood and a pair of hours, and it plans the whole
> stretch: three to five places, in order, with the reason each one is there.
> It runs on Qloo's taste graph — not on reviews, and not on whatever is
> nearest.

*Shot: the form, with the options panel already visible below it.*

**0:16 – 0:38 — The hours decide the shape**

> The hours are not just a filter. They decide what kind of plan this is.

*Type city `Lagos`, mood `a whole day out, museums and good food`. Set the
window to 10:00–23:00.*

> Ten in the morning until eleven at night is a day, not an evening. So it
> plans breakfast, something to do, the main meal, an afternoon, and a drink
> at the end. Nine at night until three in the morning would get a club
> instead.

*Shot: the time picker as you set it.*

**0:38 – 1:05 — The plan, on its own page**

*Press "Plan my evening". Speed the wait up, labelled. The plan opens on its
own page.*

> Five stops. Each card says what it is, how far the walk is, and why Qloo
> put it there — which tags matched, which affinity score, and whether Qloo's
> own explainability block supports it.

*Shot: scroll the stop cards slowly. Pause on the "why" line and the
evidence chips of the middle stop. Point out the walking total in the
opening sentence.*

**1:05 – 1:30 — Requirements are not preferences**

> This is the design decision the whole thing turns on.

*Go back, set a dietary requirement — halal — and a budget of two.*

> A vibe is a preference. The model can weigh it against a better taste
> match. A dietary need is not a preference, and neither is a wheelchair
> entrance or a budget ceiling. Those never reach the model. They are
> filters our own code holds, so there is nothing for the model to trade
> them away against.

*Shot: the Must-have chips and the budget row.*

**1:30 – 1:55 — What it did with what you asked**

*Plan again. Speed the wait up, labelled.*

> Up top it tells you what it actually did with what you asked for — and,
> when it has to, what it could not apply and why. If Qloo publishes no halal
> tag for a place, it says the requirement could not be applied rather than
> quietly serving you something that does not meet it. If nothing fitted one
> part of the day, it says that too, instead of handing you a shorter plan as
> if it were the whole answer.

*Shot: the intent echo panel. If a line reads "could not be applied", stay on
it — that line is the point.*

**1:55 – 2:20 — There is more where that came from**

> Every stop can be swapped for another place Qloo returned — six of them per
> part of the plan — and below that is everything else it found. The swaps
> cost nothing: they were all scored when the plan was built, so there is no
> extra call and no extra model round.

*Shot: open a stop's swap list, pick a different place, show the plan
reorder and the walking time change. Then scroll to "More places Qloo
returned" and let the count show.*

**2:20 – 2:38 — Yours to keep**

*Click "Copy share link", then "Save this plan".*

> The link carries the whole plan, so you can send it to whoever you are
> going with. Saving keeps it on your device, and a plan you have changed
> saves beside the original rather than over it.

**2:38 – 2:52 — Show your working**

*Click "Show how this was planned".*

> Every step is here: each Qloo endpoint it called, the parameters, and how
> long each took. The model chose which searches to run. It never chose the
> order, the scoring or the reasons — those are pure functions, so the same
> candidates always produce the same plan.

*Shot: scroll the trace entries. Pause on a `/v2/insights` line and on a
`backfill_slots` line if one is there.*

**2:52 – 2:55 — Close**

> TasteRoute. A plan for the whole stretch, from Qloo's taste graph, with its
> reasoning on the table.

## What not to claim

- Do not say it books anything. It does not.
- Do not say it knows opening hours everywhere. It reports what Qloo
  publishes and marks a stop open or not for the window you chose.
- Do not say step-free access is an option. Qloo publishes no step-free tag,
  so the product deliberately does not offer one.
- Do not show the sample-data banner and call it live Qloo. If the banner is
  on screen, the video has to say the data is a labelled fixture.
- Do not promise a club every time. A late window asks Qloo for one; where
  Qloo lists none, the plan says so and gives you a bar instead.
