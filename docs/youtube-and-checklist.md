# YouTube copy and the submission checklist

## Title

TasteRoute — a night out planned from Qloo's taste graph

## Description

Paste everything between the rules.

---
TasteRoute turns a mood, a city and a pair of hours into a plan of three to
five places, in walking order, with the reason each one is there.

The hours decide the shape. Ten in the morning to eleven at night gets
breakfast, something to do, the main meal, an afternoon and a drink. Nine at
night to three in the morning gets a club. Every stop shows why Qloo put it
there — which tags matched, the affinity score, and Qloo's own explainability
where it applies.

Try it: https://tasteroute-sepia.vercel.app
Code: https://github.com/cemek7/tasteroute

Built for the Qloo LLM Hackathon.

Chapters
0:00 What it is
0:16 The hours decide the shape
0:38 The plan, on its own page
1:05 Requirements are not preferences
1:30 What it did with what you asked
1:52 Swaps, and everything else Qloo returned
2:10 Share it and save it
2:24 Show your working
2:44 Close

The design decision the project turns on: a dietary need, an accessibility
need and a budget ceiling are requirements, not preferences. They never reach
the model. They are hard filters our own code holds, so there is nothing for a
better taste match to trade them away against. Vibe and occasion are
preferences, and the agent weighs those.

The agent decides what to ask Qloo. Our code decides what the answer is.
Scoring, ordering and the reason text are pure functions with unit tests, so
the same candidates always produce the same plan. Every Qloo call the agent
made is visible in the app, in order, with timings.

Nothing is booked. Times are estimated from your hours and the walks between
stops. Where Qloo publishes no price, no hours or no matching tag, the app
says so rather than filling the gap.

Next.js, TypeScript, Tailwind, Zod, Vitest. 476 unit tests that run with no
network, plus 12 live tests against the Qloo hackathon host.
---

## Settings on the upload page

- **Visibility: Public.** Unlisted is a common reason a judge cannot open a
  submission. Do not leave it private.
- **Made for kids: No.**
- Category: Science & Technology.
- Tags: qloo, hackathon, taste ai, nightlife, nextjs, typescript, abuja, lagos
- Leave comments on. A judge asking a question there is a good sign.

## Submission checklist

Work down it. Every line is either done or yours to do tonight.

### Already done
- [x] Public repo — https://github.com/cemek7/tasteroute
- [x] MIT licence in the repo
- [x] README with setup, architecture and the Qloo findings
- [x] Working demo — https://tasteroute-sepia.vercel.app
- [x] Demo deployed with the current build, verified live
- [x] No Qloo key in the repo, no Qloo response data committed
- [x] 476 unit tests, 12 live tests, typecheck and build clean

### Tonight, in order
- [ ] Upload `docs/media/tasteroute-demo.mp4` to YouTube, **Public**
- [ ] Paste the title and description above; add the chapters
- [ ] Copy the YouTube link
- [ ] Open the Devpost submission form
- [ ] Project name: **TasteRoute**
- [ ] Tagline: from `docs/submission.md`
- [ ] "What it does" / "How we built it" / "What we learned": from `docs/submission.md`
- [ ] Built with: qloo, nextjs, typescript, react, tailwindcss, zod, vitest, openai, vercel
- [ ] Try it out links: the demo URL and the repo URL
- [ ] Video link: the YouTube URL
- [ ] Upload a screenshot or two — use a form screenshot, not a plan page
- [ ] Press **Submit**, then reopen the submission and check it reads as submitted

### Before you press submit
- [ ] Open the demo URL in a private window. Does it plan?
- [ ] Open the repo while logged out. Does it load?
- [ ] Open the YouTube link while logged out. Does it play?

A judge will do exactly those three things first.
