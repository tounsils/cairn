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
import { summarise, verdict } from "../lib/signup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");

if (!existsSync(wrangler)) {
  console.error(`wrangler not found at ${wrangler}\nRun: npm install`);
  process.exit(1);
}

const QUERY = "SELECT email, crew, src, named_a_crew, country, ts FROM signups ORDER BY ts";

/**
 * Run wrangler's JS with this Node binary. `npx` is `npx.cmd` on Windows and
 * modern Node refuses to spawn `.cmd` without a shell; `shell: true` then
 * concatenates arguments instead of escaping them. Calling the JS avoids both.
 */
function runWrangler() {
  return spawnSync(
    process.execPath,
    [wrangler, "d1", "execute", "cairn", "--remote", "--json", "--command", QUERY],
    { cwd: join(root, "infra", "cloudflare"), encoding: "utf8" },
  );
}

/**
 * One retry, because the D1 HTTP API blips occasionally and a transient
 * failure should not look like a broken script. Two in a row is a real fault
 * and gets reported in full.
 */
let run = runWrangler();
if (run.status !== 0 || run.error) {
  run = runWrangler();
}

if (run.status !== 0 || run.error) {
  // Report everything. The previous version printed `stderr || "wrangler
  // failed"`, and wrangler writes most of its output to stdout, so a real
  // failure surfaced as four words and nothing to act on.
  console.error("\n  Could not read the database.\n");
  console.error(`  exit status : ${run.status ?? "none (process did not start)"}`);
  if (run.signal) console.error(`  signal      : ${run.signal}`);
  if (run.error) console.error(`  spawn error : ${run.error.message}`);

  const out = (run.stdout ?? "").trim();
  const err = (run.stderr ?? "").trim();
  if (err) console.error(`\n  --- stderr ---\n${err.slice(0, 1500)}`);
  if (out) console.error(`\n  --- stdout ---\n${out.slice(0, 1500)}`);
  if (!err && !out) {
    console.error(`
  Both streams were empty, which usually means a transient Cloudflare API
  failure. It already retried once. Try again in a moment; if it persists:

    npx wrangler whoami                 # is the session still valid?
    npx wrangler d1 info cairn          # does the database still exist?`);
  }
  console.error();
  process.exit(1);
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

// Imported rather than inlined. The first version of this decided the
// verdict here, untested, and returned KILL on a single signup.
const v = verdict(s.total, s.namedPct);

console.log(`
  total            ${s.total}
  named a crew     ${s.named}  (${s.namedPct}%)
  cold / warm      ${s.cold} / ${s.warm}

  by source`);
for (const [src, n] of Object.entries(s.bySrc).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${pad(src, 26)}${num(n, 4)}`);
}

console.log(`
  VERDICT: ${v.code}
  ${v.why}`);

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
