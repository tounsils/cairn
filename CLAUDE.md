# Cairn — project instructions

A daily geography puzzle where the account is a **crew**, not a person.

## Status gate — read this before writing any code

**This project is in validation. The only deliverable is `site/index.html` and the test it runs.**

Do not build the game, the generator, the crew backend or payments until the criteria in `docs/validation.md` are met. Those numbers were set in advance specifically so they cannot be rationalised after the fact. If the result is ambiguous, it is a no.

If the test passes, build in this order: round generator plus eval corpus, then tiles, then the crew, then the game surface, then payments. Not a different order. The generator comes first because a daily format is a content treadmill and it is the thing that kills solo builders.

## The product in one line

The puzzle is not the differentiator. **The crew layer is the product**, and the puzzle is the surface it runs on. Any incumbent could ship a better geo round tomorrow; none of them own the group.

## Design rules that are load-bearing, not taste

- **The streak advances on 2 players, not all of them.** A family of five where one person is on a flight must not lose the streak. Streaks should be hard to keep and harder to lose. Getting this wrong kills the product.
- **Crew score counts the best 3, not the average.** Averaging punishes a crew for having a casual member, who is exactly the person you want to keep.
- **Results reveal together at end of day.** Showing them as they arrive anchors everyone who has not played.
- **Recognition is categorical, never a ranking.** Navigator, Scout, Anchor, Wildcard. The brief was "proud to share with family," which rules out any design where the same person comes last every day.
- **Archive over hints, always.** Hints tax your most frustrated users, who are the ones about to leave. Archives tax your most engaged.

## Honesty rules for anything public-facing

This launches to Reddit daily-puzzle communities, who punish hype and are the whole distribution plan. On any page, post or copy:

- No fabricated numbers, no testimonials, no waitlist position, no referral mechanic, no countdown.
- Say plainly that it is not built yet.
- The form ships in **preview mode** with `FORM_ENDPOINT` empty and admits on submit that it stores nothing. Never leave a form that silently swallows real addresses.
- Tag every posted link with `?src=`, and report the personal-network number **separately** from the cold number. Friends sign up out of kindness and will turn a no into a false yes.

## The metric that actually decides this

Not the signup count. The free-text answers to **"Who would you play with?"** Somebody naming their brother in Tunis has done the mental work the product depends on. Under 20% naming a crew is a kill regardless of volume.

## Content pipeline, when it exists

Every round is **generated from open data and verified programmatically before it ships**. Sources: Natural Earth (public domain), GeoNames (CC-BY), Wikidata. Never hand-author the daily.

Gate generation behind an **eval corpus** asserting properties rather than answers: unambiguous target, reachable by the intended mechanic, not a disputed territory, difficulty in band, not seen in the last N days. Same discipline as `ask-me-mcp` and `finance-mcp`. A bad round is worse than no round because everyone gets the same bad round at once and screenshots it.

## Known blocker

OpenStreetMap tile policy bars commercial use. Use **Protomaps** (`.pmtiles` on object storage) rather than a hosted tile API. This also unblocks `P-roadside`.

## Gates

`site/index.html` has no build step and no dependencies. Serve it and look at it:

```bash
python -m http.server 8000 --directory site
```

Once there is application code, the four gates apply as everywhere else: build, lint, format, test, run after each change rather than once at the end, and report the skip count rather than only the passes.

## Identity

```
git config user.name "Ilyes Tounsi"
git config user.email "tounsils@gmail.com"
```

No `Co-authored-by` lines. No AI attribution in commits or PR bodies.
