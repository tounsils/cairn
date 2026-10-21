# Cairn (P-crew-daily)

Plain Node, no framework. Tests via the built-in `node --test` runner. `lint`
is a hand-rolled security gate, not a style linter — it asserts CORS is pinned
to one origin, the round endpoint withholds coordinates, scoring happens
server-side, crew links are validated and crew size is capped.
CI: `pages.yml` deploys the landing page with two content guards.

## Commands

| Purpose | Command |
|---|---|
| Full check | `npm run check` |
| Security gate | `npm run lint` |
| Tests | `npm test` |
| Serve | `npm run serve` |

## Definition of done

- `npm run check` exits 0
- `npm run lint` exits 0 — every security assertion passes. Treat a failure
  here as a defect, never as a lint nit
- `npm test` exits 0 with **0 failed, 0 skipped, 0 todo** — 50 tests as of
  2026-10-20
- Never commit to `main`

**Known gap:** `pages.yml` deploys the landing page and runs its two guards,
but never runs `check`, `lint` or the 50 tests.
