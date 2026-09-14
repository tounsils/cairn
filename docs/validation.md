# Validation plan

**Nothing gets built until this passes.** The landing page is the whole first deliverable.

## The hypothesis, stated so it can fail

> People who already play daily puzzles want to play one **as a team with people they know**, and can name that team without prompting.

Note what is not being tested: whether people like geography puzzles (they demonstrably do), or whether daily formats work (they demonstrably do). The only untested thing is the crew layer, so the test has to isolate it.

## The instrument

A one-page site that describes the crew concept, shows the mechanic, and asks for two things:

1. an email address
2. **"Who would you play with?"** (free text, optional)

Field 2 is the actual experiment. An email is a weak signal that can be given out of politeness. Someone typing *"my dad in Ohio, my sister in Seattle, and my college roommate"* has done the mental work of picturing their crew, and that is the behaviour being tested. **The text answers are worth more than the email count.**

## Decision criteria, set in advance

Two weeks from first post. Set now, before any data exists, so the result cannot be rationalised afterwards.

| Signal | Reading | Action |
|---|---|---|
| **100+ emails, and 40%+ named a crew** | Concept lands and people picture their group | Build. Generator and eval corpus first. |
| **30 to 100 emails, 40%+ named a crew** | Real but thin. Positioning or channel is wrong, concept is alive | One rewrite, one new channel, two more weeks. Then decide. |
| **Any volume, under 20% named a crew** | They want a puzzle, not a crew. The differentiator is not landing | **Kill.** This is the informative failure, not the low-traffic one. |
| **Under 30 emails** | No signal either way. Probably a traffic failure, not a concept failure | Do not read it as a verdict. Fix distribution or stop. |

The third row is the one to respect. A high email count with nobody naming a crew means the idea being validated is not the idea being built.

## Where to post

Communities where daily-puzzle behaviour already exists. In rough order of fit:

1. `r/geoguessr`, and the daily-geo community around Worldle, Globle and Travle
2. `r/wordle` and `r/NYTConnections` adjacent discussion, where group-chat play is discussed constantly
3. Daily-game Discords and the aggregator sites that index new daily games
4. Hacker News `Show HN`, once the page is genuinely finished
5. Personal network, **last** and counted separately, because friends give you an email out of kindness and will contaminate the signal

Rule: **tag the source on every signup** and report the personal-network number separately from the cold number. Mixing them is how a no gets read as a yes.

## What this test cannot tell you

Whether anyone will **pay**. It tests interest, not willingness to pay, and those are different questions. Pricing gets tested later with a real paywall, not with a survey question about price, which people answer badly.

## Cost of running it

One page, a form endpoint on a free tier, and the time to write four posts. If it fails, the loss is a weekend and the concept dies with a written reason instead of drifting.

## Instrumentation

Minimum needed for the table above to be answerable:

- signups, with a `?src=` tag preserved through to submission
- page views by source, so conversion rate is computable rather than guessed
- the free-text crew answers, exported and read individually

Do not add a general analytics suite for this. Two numbers and a text column.
