#!/usr/bin/env node
/**
 * Read the signups and print the verdict from docs/validation.md.
 *
 *     npm run results            summary + verdict
 *     npm run results -- --all   also print every crew answer, verbatim
 *
 * A raw `wrangler d1 execute` prints an empty result set when nothing has been
 * collected, which reads identically to a broken query. This says which it is,
 * and answers the question the raw query does not: whether the thing being
 * tested is actually happening.
 *
 * The percentage is the gate. The sentences are where you find out what people
 * think they are buying, so --all exists and is worth using.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarise } from "../lib/signup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");

if (!existsSync(wrangler)) {
  console.error(`wrangler not found at ${wrangler}\nRun: npm install`);
  process.exit(1);
}

// Run wrangler's JS with this Node binary. `npx` is `npx.cmd` on Windows and
// modern Node refuses to spawn `.cmd` without a shell; `shell: true` then
// concatenates arguments instead of escaping them. Calling the JS avoids both.
const run = spawnSync(
  process.execPath,
  [
    wrangler,
    "d1",
    "execute",
    "cairn",
    "--remote",
    "--json",
    "--command",
    "SELECT email, crew, src, named_a_crew, country, ts FROM signups ORDER BY ts",
  ],
  { cwd: join(root, "infra", "cloudflare"), encoding: "utf8" },
);

if (run.status !== 0) {
  console.error(run.stderr || "wrangler failed");
  process.exit(run.status ?? 1);
}

// wrangler prints progress lines before the JSON, so take from the first brace.
const text = run.stdout ?? "";
const start = text.indexOf("[");
let rows = [];
try {
  rows = JSON.parse(text.slice(start))[0]?.results ?? [];
} catch {
  console.error("Could not parse wrangler output:\n" + text.slice(0, 500));
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

if (rows.length === 0) {
  console.log(`
  No signups yet.

  The endpoint is live and the table is empty, which is the expected state
  until the link is posted. This is not a failure and not a verdict: with no
  traffic there is nothing to read either way.

  Next: post the link with a ?src= tag per docs/validation.md, and report the
  personal-network number separately from the cold one.
`);
  process.exit(0);
}

// summarise() recomputes namedACrew from the text rather than trusting the
// stored flag, so a change to the rule re-scores the whole history under one
// definition instead of leaving a mix of old and new.
const s = summarise(rows);

const verdict =
  s.namedPct < 20
    ? ["KILL", "They want a puzzle, not a crew. The differentiator did not land."]
    : s.total >= 100
      ? ["BUILD", "100+ signups and the crew idea landed. Generator and eval corpus first."]
      : s.total >= 30
        ? ["THIN", "Real but weak. One rewrite, one new channel, two more weeks."]
        : ["NO SIGNAL", "Too little traffic to read. Fix distribution, do not call it a verdict."];

console.log(`
  total            ${s.total}
  named a crew     ${s.named}  (${s.namedPct}%)
  cold / warm      ${s.cold} / ${s.warm}

  by source`);
for (const [src, n] of Object.entries(s.bySrc).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${pad(src, 26)}${num(n, 4)}`);
}

console.log(`
  VERDICT: ${verdict[0]}
  ${verdict[1]}`);

if (s.warm > 0 && s.cold > 0) {
  const coldRows = rows.filter((r) => !/^(personal|friends|family|linkedin)/.test(r.src ?? ""));
  const coldPct = summarise(coldRows).namedPct;
  console.log(`
  Cold traffic alone: ${coldRows.length} signups, ${coldPct}% named a crew.
  That is the number that matters. Friends sign up out of kindness.`);
}

if (process.argv.includes("--all")) {
  console.log("\n  Every answer to \"who would you play with\":\n");
  for (const r of rows) {
    const mark = r.crew && r.crew.trim() ? " " : "-";
    console.log(`  ${mark} [${pad(r.src ?? "direct", 20)}] ${r.crew || "(blank)"}`);
  }
} else {
  console.log(`\n  Run with --all to read the crew answers. The percentage is the gate;
  the sentences are where you learn what people think they are buying.`);
}
console.log();
