/**
 * Structural checks for the landing page and both backends.
 *
 * There is no framework here to lint, so this asserts the handful of
 * properties that actually matter and that a careless edit could silently
 * break. Every check below exists because breaking it would either lose real
 * signups or ship a page that looks live and collects nothing.
 *
 *     npm run lint
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
};

/* --- landing page --------------------------------------------------------- */
console.log("\nsite/index.html");
const page = read("site/index.html");

check("doctype and lang", page.toLowerCase().startsWith("<!doctype html>") && page.includes('lang="en"'));
check("title present", /<title>[^<]+<\/title>/.test(page));
check("honeypot field", page.includes('id="website"') && page.includes("class=\"trap\""));
check("honeypot is off-screen, not display:none", /\.trap\s*\{[^}]*left:\s*-9999px/.test(page));
check("time trap feeds the server", page.includes("elapsedMs"));
check("src tagging", page.includes('get("src")'));
check("crew field", page.includes('id="crew"'));
check("simple-request content type", page.includes("text/plain;charset=utf-8"));
check("no-cors fallback for Apps Script", page.includes('mode: "no-cors"'));
check("reduced motion honoured", page.includes("prefers-reduced-motion"));
check("focus visible", page.includes(":focus-visible"));
check("aria-live on the result", page.includes('aria-live="polite"'));
check("map has an accessible label", page.includes('aria-label="World map'));
check("map failure degrades", page.includes('map.on("error"'));

// The endpoint must be either empty (honest preview mode) or a real URL. A
// half-typed value would render a page that looks live and silently drops
// every signup, which is the single worst state this project can ship in.
const endpoint = /const FORM_ENDPOINT = "([^"]*)";/.exec(page);
check("FORM_ENDPOINT is well formed", !!endpoint && (endpoint[1] === "" || /^https:\/\/\S+$/.test(endpoint[1])),
  endpoint ? `got ${JSON.stringify(endpoint[1])}` : "constant not found");
if (endpoint && endpoint[1] === "") {
  console.log("        note: preview mode — the page collects nothing until this is set");
}

// Demo distances on the board have to match the pins on the map, or a
// geography audience will spot it immediately.
const TARGET = [-9.139, 38.722];
const pins = [...page.matchAll(/at: \[\s*(-?[\d.]+),\s*(-?[\d.]+)\]/g)].map((m) => [+m[1], +m[2]]);
const shown = [...page.matchAll(/data-to="(\d+)"/g)].map((m) => +m[1]);
const hav = (a, b) => {
  const R = 6371, r = (d) => (d * Math.PI) / 180;
  const dLat = r(b[1] - a[1]), dLon = r(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
check("board distances match the map pins", pins.length === shown.length && pins.every((p, i) => {
  const miles = hav(p, TARGET) * 0.621371;
  return Math.abs(miles - shown[i]) <= 2;
}), `pins ${pins.length}, numbers ${shown.length}`);

/* --- backends ------------------------------------------------------------- */
console.log("\ninfra");
for (const f of ["infra/lib/signup.mjs", "infra/aws/handler.mjs", "infra/test/signup.test.mjs"]) {
  let ok = true, why = "";
  try {
    execFileSync(process.execPath, ["--check", join(root, f)], { stdio: "pipe" });
  } catch (e) {
    ok = false;
    why = String(e.stderr || e.message).split("\n").find((l) => l.includes("Error")) || "parse error";
  }
  check(`${f} parses`, ok, why);
}

// Code.gs targets the Apps Script runtime, so it is parsed as a classic
// script rather than a module.
try {
  new (Function.prototype.bind.call(Function, null, read("infra/apps-script/Code.gs")))();
  check("infra/apps-script/Code.gs parses", true);
} catch (e) {
  check("infra/apps-script/Code.gs parses", false, e.message);
}

// The two backends must agree on the rules, or the same person gets a
// different answer depending on which one is deployed.
const canonical = read("infra/lib/signup.mjs");
const gs = read("infra/apps-script/Code.gs");
check("both backends use the same bot threshold",
  /MIN_ELAPSED_MS = 2000/.test(canonical) && /MIN_ELAPSED_MS = 2000/.test(gs));
check("both backends accept a zero/unknown timer",
  canonical.includes("elapsedMs > 0") && gs.includes("elapsed > 0"));
check("both backends strip control chars with escapes",
  canonical.includes("\\x00-\\x1F\\x7F") && gs.includes("\\x00-\\x1F\\x7F"));
check("no raw control bytes in source",
  ![canonical, gs, page].some((s) => /[\x00-\x08\x0E-\x1F\x7F]/.test(s)));

/* --- deploy safety -------------------------------------------------------- */
console.log("\ndeploy");
const wf = read(".github/workflows/pages.yml");
check("Pages workflow guards a malformed endpoint", wf.includes("FORM_ENDPOINT"));
check("signup exports are gitignored", /signups.*\.csv/.test(read(".gitignore")));

console.log(failed === 0 ? "\nall checks passed\n" : `\n${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
