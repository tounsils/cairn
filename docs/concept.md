# Concept spec

Working name: **WAYFARE**. Placeholder. Pick the real one before any money is spent on a domain.

---

## The one-line version

A daily geography puzzle where the account is a **crew**, not a person, and the streak belongs to the crew.

## The insight it is built on

Every successful daily puzzle is already played socially, and none of them know it. Wordle, Connections, Worldle and Travle all grow the same way: one person posts their result in a group chat and nudges everyone else to play. That social layer is the actual growth engine and it lives entirely in WhatsApp and iMessage, where the product captures none of it.

So: stop treating the group as a share button and make it the unit of account.

## What is not the differentiator

The puzzle. Daily geography games are a crowded, proven genre (Worldle, Globle, Travle, EarthGuessr, City Guesser). Do not try to win on puzzle novelty. Assume any of them could ship a good geo round tomorrow, because they already have.

The crew layer is the product. The puzzle is the surface it runs on.

---

## Crew model

- A crew is **2 to 6 people**. Below 2 there is no social loop; above 6 nobody feels individually needed, and Duolingo caps Friend Streaks at 5 for the same reason.
- A crew has a **name, a streak, and one shared daily result**.
- You join by **link**. No app install, no account required to play your first round. Identity can be claimed later, once the crew matters enough to protect.
- One person is the **host**. The host is who pays, if anyone does.

## The daily round

- **One location per day, the same for every crew in the world.** Shared scarcity is the entire reason the daily format works. It creates a reason to show up, a reason to compare, and a natural stopping point.
- Each member plays **privately** within their crew's 24-hour window. No live coordination, so it works when your brother is six time zones away.
- Results **reveal to the crew at the end of the window**, not as they arrive. Seeing a good score first would anchor everyone else and kill the fun.

### Scoring, and why it is "best 3"

Crew score counts the **best 3 member results**, not the average and not the sum.

- Average punishes crews for having a casual member, which is exactly who you want to keep.
- Sum punishes small crews and rewards recruiting warm bodies.
- Best-of-3 means a weak day does not sink the crew, a missing person does not either (in a crew of 4+), and there is still a reason for the fourth person to play, because they might be in the top 3.

## The streak rule, which is the most important decision in the product

**The crew streak advances if at least 2 members play that day.**

Not all of them. This is the mistake that would kill it. A family of five where one person is on a plane loses the streak, feels the loss, and then has nothing left to protect, so they churn together. Streaks must be hard to keep and harder to lose.

The evidence this mechanic is worth building around: Duolingo reports users with at least one Friend Streak are **22% more likely to complete their daily lesson**, the strongest social retention layer they have. The psychology they name is the point: missing a day does not just break your number, it lets your partner down.

## Gamification that is not competition

The brief was "proud to share with family," which rules out a design where grandma comes last every day. Per-member recognition should be **categorical, not ranked**:

- **Navigator** — most accurate this week
- **Scout** — first to play, most days
- **Anchor** — longest personal run without missing
- **Wildcard** — biggest single improvement

Everyone can hold something. Nobody is told they are worst.

---

## Monetization

Free tier has to be genuinely good or the growth loop never runs.

| | Free | Crew Pass |
|---|---|---|
| Daily round | yes | yes |
| Crew size | up to 4 | up to 8 |
| Current streak | yes | yes |
| Archive (play past rounds) | no | yes |
| Full stats and streak history | no | yes |
| More than one crew | no | yes |
| Author a round for your own crew | no | yes |
| Ads | yes | no |

**The host pays once for the whole crew.** Per-seat pricing is wrong here and matches nothing about how families buy anything.

**Price anchor: $29.99/year per crew**, deliberately under Puzzmo's $39.99. At 1,000 paying crews that is $30k a year from roughly 4,000 humans.

Compare with the model this replaces: ad revenue benchmarks for web games run about $10 to $40 per thousand DAU per month, so 20,000 daily users earns roughly $400 a month. The subscription path needs around five times fewer people for eight times the money. That comparison is the whole reason for the design.

**Archive over hints, always.** Hints tax your most frustrated users, who are the ones about to leave. The archive taxes your most engaged. Same paywall slot, opposite selection effect. Puzzmo already gates archive, leaderboards and **groups**, which is independent evidence that group features are what people pay for.

---

## Content pipeline, which decides whether a solo builder survives

A daily format is a content treadmill. Hand-authoring kills people. So the rule is:

**Every round is generated from open data and verified programmatically before it ships.**

Candidate sources, all with usable licences:
- **Natural Earth** — country and admin boundaries, public domain
- **GeoNames** — populated places with population figures, CC-BY
- **Wikidata** — cross-references and disambiguation

Generation must be gated by an **eval corpus**, the same discipline as `ask-me-mcp` and `finance-mcp`: a bad daily round is worse than no round, because it is the same bad round for everybody at once and it is the thing they all screenshot. The corpus asserts properties, not answers. For example: the target is unambiguous, it is reachable by the intended mechanic, it is not a disputed territory, the difficulty band is within range, and it has not appeared in the last N days.

Build the generator and the corpus **before** the game. Two hundred verified rounds in the bank is what turns this from a demo into something that can run unattended.

## The known blocker, carried over from P-roadside

**OpenStreetMap's tile usage policy bars commercial and heavy use.** This blocks P-roadside today and would block this too.

Recommended fix: **Protomaps**. A single `.pmtiles` file served from object storage, no per-tile billing, no rate limit, no third-party dependency at runtime. MapTiler and Stadia are the hosted alternatives if the one-time extraction work is not worth it. Solving this once unblocks both projects, which is a genuine argument for doing it now rather than later.

---

## What it reuses

Confirmed present in `P-roadside` and directly transferable: Next.js 16.3.4, React 19.2.8, **maplibre-gl 6.7.0**, Zod 4.5.4, Tailwind v4, Vitest 5, plus existing `geocode-stops.mjs` and `fetch-route-path.mjs` geo tooling. Stripe is already running in `P-AIOS`. Realtime socket work came out of the teleop server.

This matters because it is the exact test the escape room idea failed.

---

## Honest risks

1. **Defensibility on the mechanic is near zero.** Teuteuf Games, who make Worldle and Travle, could ship crews in a week. The moat is the crew graph and the accumulated streak, not the idea. Being second is bad, so speed matters more than polish.
2. **Most post-Wordle daily games did not survive a year.** Hundreds launched; the survivors differentiated rather than cloned.
3. **Realistic outcome for a first web game is $500 to $3,000 a month**, and that is the case where it works at all.
4. **Category numbers in the research came largely from daily-game aggregator blogs** that have an incentive to hype the genre. The Puzzmo pricing and the Duolingo retention figure are the two solid ones. Treat the rest as directional.
