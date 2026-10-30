# TasteRoute — 3-minute demo video script

Target length 2:51. Recorded on the desktop with the Loom browser
extension. Everything below is spoken over screen capture; there is no
talking head.

## Before you record

The app lays itself out for the screen it is on. Below 1024px it is the
single mobile column it always was; at 1024px and up the form puts the
questions on the left and the options panel on the right, and a plan puts
the stops on the left with the share, save and extra-places panel beside
them. So a desktop recording needs no zoom trick and no phone:

1. Maximise the browser window on this desktop, at 100% zoom (`Ctrl 0`).
   At 1440px wide the whole form fits one screen — city, mood, hours and
   every option visible at once, nothing to scroll past on camera.
2. In Loom choose **Screen Only → Current Tab**. Current Tab records just
   the page, with no browser chrome and no desktop behind it. Do not pick
   Full Desktop: it would film your whole screen, taskbar included.
3. Turn the camera bubble off, or move it to a corner where it covers no
   stop card. At 1440px the bottom-left corner is empty.
4. Keep it landscape. Devpost and Loom both play back landscape, and a
   portrait video gets black bars either side on a judge's screen.

If you would rather show the mobile layout, narrow the window to about
500px instead and the same script still works — the stops simply stack
under the plan instead of sitting beside the panel.

Then:

- Open https://tasteroute-sepia.vercel.app in that window.
- Clear site data, so the options panel starts empty.
- Check the OpenRouter key has credit. A failed plan on camera is a retake.
- Plan each of the two routes once before recording, so Qloo's results are
  warm and you know what is going to come back.
- Loom's free tier caps a video at 5 minutes. This script is under 3.

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

*Shot: the whole form in one screen — questions on the left, the options
panel open on the right. Nothing was clicked to reveal it.*

**0:16 – 0:38 — The hours decide the shape**

> The hours are not just a filter. They decide what kind of plan this is.

*Tap the **A day out** preset — it fills the mood and sets the window to
10:00–20:00 — then change the city to `Lagos` and push the end to 23:00.*

> Ten in the morning until eleven at night is a day, not an evening. So it
> plans breakfast, something to do, the main meal, an afternoon, and a drink
> at the end. Nine at night until three in the morning would get a club
> instead.

*Shot: the time picker as you set it.*

**0:38 – 1:05 — The plan, on its own page**

*Press "Plan my evening". Speed the wait up, labelled. The plan opens on its
own page.*

> Five stops. Each card says what it is, how far the walk is, roughly when
> you get there, and why Qloo put it there — which tags matched, which
> affinity score, and whether Qloo's own explainability block supports it.
> The times are worked out from your hours and the walks, and the page says
> so: nothing here is booked. Where Qloo publishes a price band it says that
> too, and how many of the stops it actually covers.

*Shot: scroll the stop cards slowly. Pause on the "why" line and the
evidence chips of the middle stop. Point out the walking total in the
opening sentence, the "from 7:40pm" beside a venue name, and the price line
under the summary.*

**1:05 – 1:30 — Requirements are not preferences**

> This is the design decision the whole thing turns on.

*Go back, set a dietary requirement — halal — and a budget of two.*

> A vibe is a preference. The model can weigh it against a better taste
> match. A dietary need is not a preference, and neither is a wheelchair
> entrance or a budget ceiling. Those never reach the model. They are
> filters our own code holds, so there is nothing for the model to trade
> them away against.

*Shot: the Must-have chips and the budget row.*

**1:30 – 1:52 — What it did with what you asked**

*Plan again. Speed the wait up, labelled.*

> Up top it tells you what it actually did with what you asked for — and,
> when it has to, what it could not apply and why. If Qloo publishes no halal
> tag for a place, it says the requirement could not be applied rather than
> quietly serving you something that does not meet it. If nothing fitted one
> part of the day, it says that too, instead of handing you a shorter plan as
> if it were the whole answer.

*Shot: the intent echo panel. If a line reads "could not be applied", stay on
it — that line is the point.*

**1:52 – 2:10 — There is more where that came from**

> Every stop can be swapped for another place Qloo returned — six of them per
> part of the plan — and below that is everything else it found. The swaps
> cost nothing: they were all scored when the plan was built, so there is no
> extra call and no extra model round.

*Shot: open a stop's swap list, pick a different place, show the plan
reorder and the walking time change. Then scroll to "More places Qloo
returned" and let the count show.*

**2:10 – 2:24 — Yours to keep**

*Click "Copy share link", then "Save this plan".*

> The link carries the whole plan, so you can send it to whoever you are
> going with. Saving keeps it on your device, and a plan you have changed
> saves beside the original rather than over it.

**2:24 – 2:44 — Show your working**

*Click "Show how this was planned".*

> Every step is here: each Qloo endpoint it called, the parameters, and how
> long each took. The model chose which searches to run. It never chose the
> order, the scoring or the reasons — those are pure functions, so the same
> candidates always produce the same plan.

*Shot: scroll the trace entries. Pause on a `/v2/insights` line and on a
`backfill_slots` line if one is there.*

**2:44 – 2:51 — Close**

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
