/**
 * Structural checks for the two pages and the backend.
 *
 * No framework to lint here, so this asserts the handful of properties a
 * careless edit could silently break. Each one exists because breaking it
 * would either leak the answer, lose a play, or ship a page that looks alive
 * and measures nothing.
 *
 *     npm run lint
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ROUND } from "../infra/lib/game.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
};

/* --- the game ------------------------------------------------------------- */
console.log("\nsite/index.html  (the game)");
const game = read("site/index.html");

check("doctype and lang", game.toLowerCase().startsWith("<!doctype html>") && game.includes('lang="en"'));
check("title", /<title>[^<]+<\/title>/.test(game));
check("viewport with safe-area", game.includes("viewport-fit=cover"));

/**
 * The single most important check in this file. The coordinates live on the
 * server and are returned only in response to a committed guess. If they ever
 * appear in the page source, anyone can read the answer from devtools before
 * playing, and every distance on every crew board becomes meaningless.
 */
const lngFragment = String(ROUND.lng).slice(0, 6);
const latFragment = String(ROUND.lat).slice(0, 6);
check(
  "the answer is NOT in the client source",
  !game.includes(lngFragment) && !game.includes(latFragment),
  `found ${lngFragment} or ${latFragment} in the page`,
);
check("map carries no place labels that would give it away", !game.includes('"symbol"'));

check("honeypot field", game.includes('id="website"') && game.includes('class="trap"'));
check("honeypot is off-screen, not display:none", /\.trap\{[^}]*left:-9999px/.test(game.replace(/\s/g, "")));
check("time trap is sent", game.includes("elapsedMs"));
check("src tagging survives into the play", game.includes('params.get("src")'));
check("crew link is read from the URL", game.includes('params.get("c")'));
check("board output is escaped", game.includes("esc(p.player)"));
check("guessing closes once locked in", game.includes("if (playId) return;"));
check("map has an accessible label", game.includes('aria-label="World map'));
check("result region is announced", game.includes('aria-live="polite"'));
check("reduced motion honoured", game.includes("prefers-reduced-motion"));
check("focus visible", game.includes(":focus-visible"));

const api = /const API = "([^"]*)";/.exec(game);
check(
  "API endpoint is a real https URL",
  !!api && /^https:\/\/\S+$/.test(api[1]),
  api ? `got ${JSON.stringify(api[1])}` : "constant not found",
);

/* --- the pitch ------------------------------------------------------------ */
console.log("\nsite/about.html  (the pitch)");
const about = read("site/about.html");
check("no form left on it", !about.includes("<form"));
check("routes into the game", about.includes('href="./"'));
check("does not still reference a dead endpoint handler", !about.includes("FORM_ENDPOINT ="));
check("the answer is not here either", !about.includes(lngFragment) && !about.includes(latFragment));

/* --- backend -------------------------------------------------------------- */
console.log("\ninfra");
for (const f of [
  "infra/lib/game.mjs",
  "infra/lib/signup.mjs",
  "infra/cloudflare/worker.mjs",
  "infra/cloudflare/results.mjs",
  "infra/test/game.test.mjs",
  "infra/test/signup.test.mjs",
]) {
  let ok = true, why = "";
  try {
    execFileSync(process.execPath, ["--check", join(root, f)], { stdio: "pipe" });
  } catch (e) {
    ok = false;
    why = String(e.stderr || e.message).split("\n").find((l) => l.includes("Error")) || "parse error";
  }
  check(`${f} parses`, ok, why);
}

const worker = read("infra/cloudflare/worker.mjs");
check("the round endpoint withholds the coordinates", !/\/round[\s\S]{0,400}ROUND\.lng/.test(worker));
check("scoring happens on the server", worker.includes("scoreGuess"));
check("crew links are validated before a play joins one", worker.includes("that crew link is not valid"));
check("crew size is capped", worker.includes("MAX_CREW_SIZE"));
check("CORS is pinned to one origin", worker.includes("ALLOWED_ORIGIN"));
check("no raw control bytes in source", ![game, about, worker].some((s) => /[\x00-\x08\x0E-\x1F\x7F]/.test(s)));

console.log(failed === 0 ? "\nall checks passed\n" : `\n${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
