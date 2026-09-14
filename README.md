# Wayfare (working name)

A daily geography puzzle where the account is a **crew**, not a person, and the streak belongs to the crew.

**Status: validation only. Nothing is built and nothing should be built until the test in [`docs/validation.md`](docs/validation.md) passes.**

---

## The bet, in one paragraph

Every successful daily puzzle is already played socially and none of them know it. Wordle, Connections, Worldle and Travle all grow the same way: somebody posts their result in a group chat and nudges everybody else to play. That social layer is the real growth engine and it lives entirely in WhatsApp and iMessage, where the product captures none of it. So stop treating the group as a share button and make it the unit of account.

The puzzle is not the differentiator. Daily geography is a crowded, proven genre and any incumbent could ship a good round tomorrow. **The crew layer is the product.**

## Why it might pay, when the free-to-play version could not

| Model | People needed | Annual revenue |
|---|---|---|
| Ads on a daily web game | 20,000 daily actives | ~$4,800 |
| Crew Pass at $29.99/yr | ~4,000 people in 1,000 crews | ~$30,000 |

Web-game ad benchmarks run about $10 to $40 per thousand DAU per month. Puzzmo, the closest comparable, charges $3.99/month or $39.99/year, keeps the daily puzzles free, and paywalls the archive, leaderboards and **groups**. Somebody has already established that group features are what people pay for.

## Repo layout

| Path | What it is |
|---|---|
| [`docs/concept.md`](docs/concept.md) | The spec. Crew model, scoring, the streak rule, gamification, pricing, content pipeline. |
| [`docs/validation.md`](docs/validation.md) | The test, with go/no-go numbers **set in advance**. |
| [`docs/research.md`](docs/research.md) | What the research actually found, with sources and a note on which numbers to trust. |
| [`site/index.html`](site/index.html) | The validation landing page. Self-contained, no build step, no CDN. |

## Running the landing page

It is one file with no dependencies.

```bash
python -m http.server 8000 --directory site
# http://localhost:8000
```

Deploy by copying `site/index.html` anywhere static: GitHub Pages, Vercel, Netlify, S3.

### Wiring the form

The page ships in **preview mode**: `FORM_ENDPOINT` at the top of the inline script is empty, the form collects nothing, and it says so on submit. That is deliberate. A form that silently swallows real addresses is worse than one that admits it is not connected.

To go live, set `FORM_ENDPOINT` to a JSON POST URL from Formspree, Tally or Buttondown. The page posts three fields:

```json
{ "email": "...", "crew": "...", "src": "reddit-geoguessr" }
```

`src` comes from the `?src=` query parameter, so **tag every link you post**. Per `docs/validation.md`, the personal-network number has to be reported separately from the cold number or a no gets read as a yes.

## The field that is the actual experiment

The form asks for an email and for **"Who would you play with?"**

The second one is the test. An email is cheap politeness. Someone typing *"my brother in Tunis, my wife, my daughter"* has pictured their crew, which is the exact behaviour the product depends on. **The text answers matter more than the signup count**, and the kill criterion is written against them: any volume with under 20% naming a crew means people want a puzzle, not a crew, and the differentiator has not landed.

## Design notes

Nautical chart rather than travel brochure. Cool chart-paper ground with a structural teal, and a single warm signal orange used **only** on human elements: the people in the crew and the streak they keep. A cold instrument recording a warm ritual. Humanist sans display over a serif body, inverting the usual pairing, with mono for the instrument readouts. Contours are drawn on canvas rather than shipped as an image. One animated moment, the streak counter, because that is what the product is about.

No fabricated numbers, no testimonials, no waitlist position, no referral mechanic. The audience for this is Reddit daily-puzzle regulars, who punish hype, so the page says outright that it is not built yet.

## Known blocker, shared with P-roadside

**OpenStreetMap's tile usage policy bars commercial and heavy use.** This already blocks [P-roadside](../P-roadside/) and would block this. Recommended fix is **Protomaps**: one `.pmtiles` file on object storage, no per-tile billing and no rate limit. Solving it once unblocks both, which is a real argument for doing it now.

## What this reuses

Confirmed present in `P-roadside` and directly transferable: Next.js 16.3.4, React 19.2.8, **maplibre-gl 6.7.0**, Zod 4.5.4, Tailwind v4, Vitest 5, plus `geocode-stops.mjs` and `fetch-route-path.mjs`. Stripe is already live in `P-AIOS`.

That matters because reuse-of-existing-assets is the screen that killed the previous idea in this thread.

## If the test passes

Build in this order, and not a different one:

1. **Round generator plus its eval corpus.** Not the game. A bad daily round is worse than no round because it is the same bad round for everyone at once and it is the thing they all screenshot. Two hundred verified rounds in the bank is what turns this from a demo into something that runs unattended.
2. Tiles, via Protomaps.
3. The crew: join-by-link, shared streak, end-of-day reveal.
4. The game surface.
5. Payments, last.

## Honest risks

- **Defensibility on the mechanic is near zero.** Teuteuf Games, who make Worldle and Travle, could ship crews in a week. The moat is the crew graph and the accumulated streak. Being second is bad, so speed beats polish.
- **Most post-Wordle daily games did not survive a year.**
- **Realistic ceiling for a first web game is $500 to $3,000 a month**, in the case where it works at all.
- This does not clear the bar set by the existing shortlist. It is not on it, and it should not displace anything already scored.
