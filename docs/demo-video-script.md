# TasteRoute — 3-minute demo video script

Target length 2:55. Shot on a phone-width browser window (the app is
mobile-first). Everything below is spoken over screen capture; there is no
talking head.

## Before you record

- Open https://tasteroute-sepia.vercel.app in a fresh window, phone width.
- Clear site data, so "forget my preferences" is not needed on camera and the
  Tune panel starts empty.
- Have a second tab already holding a planned route for Abuja, in case a live
  call is slow. Do not cut to it silently — see "On the waits" below.
- Check the OpenRouter key has credit. A failed plan on camera is a retake.

## On the waits

A plan makes several Qloo calls and one model round, and the app says so:
"The planner makes several Qloo calls. This takes up to a minute." Do not
pretend it is instant. Speed the waiting footage up and put `8× speed` in the
corner while it runs. A judge who sees a labelled speed-up trusts the rest of
the video; one who suspects a cut does not.

## Script

**0:00 – 0:18 — The problem, in one breath**

> Pick a city, say what kind of night you want, and TasteRoute plans one
> evening: three places, in an order that works, with the reason each one is
> there. It is built on Qloo's taste graph — not on reviews, and not on
> whatever is nearest.

*Shot: the empty form. City, mood, the time window.*

**0:18 – 0:40 — The vague ask, and the question it earns**

> I will be deliberately vague.

*Type city `Abuja`, mood `something nice`. Leave the time window at 18:00 to
23:00. Press "Plan my evening".*

> It does not guess. It decides it has not been told enough, and asks one
> question — with its own reason for asking.

*Shot: the clarifying question with its options and the "because" line. Read
the reason aloud, whatever it says. Then click one option.*

**0:40 – 1:10 — The route**

*Let it plan. Speed the wait up, labelled.*

> Three stops. A place to start, the main event, somewhere to finish. Each
> card says what it is, how far the walk is, and why Qloo put it there —
> which tags matched, which affinity score, and whether Qloo's own
> explainability block supports it.

*Shot: scroll the three stop cards slowly. Pause on the "why" line and on the
evidence chips of the middle stop.*

**1:10 – 1:40 — Requirements are not preferences**

> This is the design decision the whole thing turns on.

*Open "Tune this (optional)". Set a dietary requirement — halal — and a
budget of two.*

> A vibe is a preference. The model can weigh it against a better taste
> match. A dietary need is not a preference, and neither is a wheelchair
> entrance or a budget ceiling. Those never reach the model. They are
> filters our own code holds, so there is nothing for the model to trade
> them away against.

*Shot: the Must-have chips and the budget row.*

**1:40 – 2:05 — Replan, and the honesty panel**

*Press "Plan my evening" again. Speed the wait up, labelled.*

> Up top it tells you what it actually did with what you asked for — and,
> when it has to, what it could not apply and why. If Qloo has no halal tag
> for a place, it says the requirement could not be applied rather than
> quietly serving you something that does not meet it.

*Shot: the intent echo panel. If a line reads "could not be applied", stay on
it — that line is the point.*

**2:05 – 2:30 — It is yours to change**

> Any stop can be swapped for another place Qloo returned, and the swap costs
> nothing: those alternatives were already scored when the route was built,
> so there is no extra call and no extra model round.

*Shot: open a stop's swap list, pick a different place, show the route
reorder. Then "Copy share link" and "Save this route".*

**2:30 – 2:50 — Show your working**

*Click "Show how this was planned".*

> Every step is here: each Qloo endpoint it called, the parameters, and how
> long each took. The model chose which searches to run. It never chose the
> order, the scoring or the reasons — those are pure functions, so the same
> candidates always produce the same route.

*Shot: scroll the trace entries. Pause on a `/v2/insights` line.*

**2:50 – 2:55 — Close**

> TasteRoute. One good evening, from Qloo's taste graph, with its reasoning
> on the table.

## What not to claim

- Do not say it books anything. It does not.
- Do not say it knows opening hours everywhere. It reports what Qloo
  publishes and marks a stop open or not for the window you chose.
- Do not say step-free access is an option. Qloo publishes no step-free tag,
  so the product deliberately does not offer one.
- Do not show the sample-data banner and call it live Qloo. If the banner is
  on screen, the video has to say the data is a labelled fixture.
