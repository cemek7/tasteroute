# TasteRoute — voiceover only

Just the words. Read these aloud over the screen capture. Shot directions
and setup live in `demo-video-script.md`; this file is the teleprompter.

Target 2:51. Roughly 440 spoken words, which is a comfortable pace — do
not rush to fit, the timings have slack in them.

---

**0:00**

Give TasteRoute a city, a mood and a pair of hours, and it plans the whole
stretch: three to five places, in order, with the reason each one is there.
It runs on Qloo's taste graph — not on reviews, and not on whatever is
nearest.

**0:16**

The hours are not just a filter. They decide what kind of plan this is.

Ten in the morning until eleven at night is a day, not an evening. So it
plans breakfast, something to do, the main meal, an afternoon, and a drink
at the end. Nine at night until three in the morning would get a club
instead.

**0:38**

Five stops. Each card says what it is, how far the walk is, roughly when
you get there, and why Qloo put it there — which tags matched, which
affinity score, and whether Qloo's own explainability block supports it.

The times are worked out from your hours and the walks, and the page says
so: nothing here is booked. Where Qloo publishes a price band it says that
too, and how many of the stops it covers.

**1:05**

This is the design decision the whole thing turns on.

A vibe is a preference. The model can weigh it against a better taste
match. A dietary need is not a preference, and neither is a wheelchair
entrance or a budget ceiling. Those never reach the model. They are
filters our own code holds, so there is nothing for the model to trade
them away against.

**1:30**

Up top it tells you what it actually did with what you asked for — and,
when it has to, what it could not apply and why. If Qloo publishes no
halal tag for a place, it says the requirement could not be applied rather
than quietly serving you something that does not meet it. If nothing
fitted one part of the day, it says that too.

**1:52**

Every stop can be swapped for another place Qloo returned — six per part
of the plan — and below that is everything else it found. The swaps cost
nothing: they were all scored when the plan was built, so there is no
extra call and no extra model round.

**2:10**

The link carries the whole plan, so you can send it to whoever you are
going with. Saving keeps it on your device, and a plan you have changed
saves beside the original rather than over it.

**2:24**

Every step is here: each Qloo endpoint it called, the parameters, and how
long each took. The model chose which searches to run. It never chose the
order, the scoring or the reasons — those are pure functions, so the same
candidates always produce the same plan.

**2:44**

TasteRoute. A plan for the whole stretch, from Qloo's taste graph, with
its reasoning on the table.
