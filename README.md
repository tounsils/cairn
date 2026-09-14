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

One file. No build step, no package manager, no framework.

```bash
python -m http.server 8000 --directory site
# http://localhost:8000
```

It pulls three things from CDNs at runtime: MapLibre GL 4.7.1, Google Fonts, and MapLibre's own demo tiles. All three are verified reachable and all three degrade safely. If MapLibre fails to load or the tiles error, the map hides itself and the atmospheric gradient behind it carries the hero. The page never depends on the map to be readable.

## Deploying to GitHub Pages

`.github/workflows/pages.yml` publishes `site/` on every push to `main` that touches it. Pages is fed from the workflow rather than from a branch folder, because the branch-folder option would force the site into `docs/` and collide with the project documentation already there.

One-time setup after the repo exists:

1. **Settings → Pages → Source → GitHub Actions**
2. Push to `main`, or run the workflow manually from the Actions tab.

The workflow includes a guard: if `FORM_ENDPOINT` is set to anything that is not an `http(s)` URL it **fails the build**, and if it is empty it emits a warning saying the page will deploy in preview mode and store nothing. The failure mode being prevented is a page that looks live and quietly discards every signup.

### Wiring the form

The page ships in **preview mode**: `FORM_ENDPOINT` at the top of the inline script is empty, the form collects nothing, and it says so on submit. That is deliberate. A form that silently swallows real addresses is worse than one that admits it is not connected.

To go live, set `FORM_ENDPOINT` to a JSON POST URL from Formspree, Tally or Buttondown. The page posts three fields:

```json
{ "email": "...", "crew": "...", "src": "reddit-geoguessr" }
```

`src` comes from the `?src=` query parameter, so **tag every link you post**. Per `docs/validation.md`, the personal-network number has to be reported separately from the cold number or a no gets read as a yes.

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

**Night earth.** One committed visual world: the planet seen from orbit at night. Family scattered across a dark globe is the emotional core of the product, so it is also the picture. Single-theme dark by choice, not omission.

Colour is assigned by meaning rather than decoration. **Amber is reserved for people** (avatars, the Navigator tag, the streak). **Cyan is reserved for data** (distances, arcs, the target beacon). The ground never competes with either.

The hero image is **a real map**, not stock photography. MapLibre renders today's target in Lisbon with the three crew guesses pinned around it and dashed arcs bowing back to the answer, which is the product demonstrating itself. It is deliberately non-interactive so it cannot hijack a phone scroll. The target pulses like a beacon on a chart, and the whole view drifts slowly over fourteen seconds so the hero breathes without demanding attention.

Type is **Bricolage Grotesque** for display and **Schibsted Grotesk** for body, with JetBrains Mono for readouts. Deliberately not Inter or Space Grotesk.

Motion is orchestrated rather than scattered: a masked three-line headline rise, crew rows dealing in one at a time, distance counters ticking up, and scroll reveals via IntersectionObserver. Every bit of it collapses under `prefers-reduced-motion`.

No fabricated numbers, no testimonials, no waitlist position, no referral mechanic. The audience is Reddit daily-puzzle regulars, who punish hype, so the page says outright that it is not built yet.

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
