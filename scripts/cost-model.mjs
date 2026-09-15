/**
 * What the MVP costs to run, per month, at three scales.
 *
 *     node scripts/cost-model.mjs
 *
 * List prices verified 2026-09-14 and cited in docs/costs.md. Re-run this
 * rather than trusting the numbers in the doc; the doc is generated from here.
 *
 * The point of writing it as code is that the assumptions are visible and
 * arguable. If you think 30 tiles per session is wrong, change it and see what
 * moves. Most of them turn out not to matter, which is itself the finding.
 */

/* --- what a person does in a day ------------------------------------------ */
const USAGE = {
  membersPerCrew: 4,
  sessionsPerPersonPerDay: 1, // it is a daily game; that is the whole design
  tilesPerSession: 30, // only if a streamed basemap is used at all
  apiCallsPerSession: 10, // load round, submit guess, poll board, reveal
  writesPerSession: 2, // the guess, and the crew/streak update
  daysPerMonth: 30,
};

const TIERS = [
  { name: "Launch", crews: 100, priceYr: 29.99 },
  { name: "Target", crews: 1_000, priceYr: 29.99 }, // the $30k/yr model
  { name: "Success", crews: 10_000, priceYr: 29.99 },
];

/* --- verified list prices ------------------------------------------------- */
const P = {
  r2: { storageGbMo: 0.015, classB: 0.36 / 1e6, freeGb: 10, freeClassB: 10e6, egress: 0 },
  workers: { flat: 5, includedReq: 10e6, perM: 0.3 },
  lambda: { freeReq: 1e6, perReq: 0.2 / 1e6, freeGbs: 400_000, perGbs: 0.0000166667 },
  dynamo: { wru: 1.25 / 1e6, rru: 0.25 / 1e6 },
  ses: { per1k: 0.1 },
  // Google Cloud TTS, per million characters. Standard has 4M chars/mo free.
  tts: { standard: 4, neural2: 16, chirpHd: 30, studio: 160, freeStandardChars: 4e6 },
  // Gemini Live conversational audio, ~25 tokens/sec of audio.
  geminiLive: { perMinute: 0.0368 },
  geminiFlashText: { perMTokens: 0.3 }, // writing the script, not speaking it
  resend: { per1k: 0.9 }, // ~$90 for 100k on their scale tiers
  mapbox: { freeLoads: 50_000, per1k: 5.0 }, // $3/1k above 200k; using the common rate
  maptiler: { flatUnlimited: 295 },
  streetview: { freeViews: 5_000, per1k: 6.0 }, // $5.60-$7.00 by volume
  stripe: { pct: 0.029, fixed: 0.3 },
};

const money = (n) => (n === 0 ? "$0" : n < 1 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString()}`);

function model(tier) {
  const people = tier.crews * USAGE.membersPerCrew;
  const sessions = people * USAGE.sessionsPerPersonPerDay * USAGE.daysPerMonth;
  const tiles = sessions * USAGE.tilesPerSession;
  const api = sessions * USAGE.apiCallsPerSession;
  const writes = sessions * USAGE.writesPerSession;
  const revenueMo = (tier.crews * tier.priceYr) / 12;

  /* --- the map decision, which is the whole ballgame --------------------- */
  // A. Static geometry. Worldle / Globle / Travle do this: simplified country
  //    boundaries shipped once as an asset and cached. No tile server exists.
  const mapStatic = 0;

  // B. Self-hosted vector tiles, PMTiles on R2.
  const tileStoreGb = 15;
  const mapR2 =
    Math.max(0, tileStoreGb - P.r2.freeGb) * P.r2.storageGbMo +
    Math.max(0, tiles - P.r2.freeClassB) * P.r2.classB;

  // C. Hosted tile API, billed per map load rather than per tile.
  const mapMapbox = (Math.max(0, sessions - P.mapbox.freeLoads) / 1000) * P.mapbox.per1k;

  // D. Street-level imagery, the GeoGuessr shape.
  const streetview = (Math.max(0, sessions - P.streetview.freeViews) / 1000) * P.streetview.per1k;

  /* --- everything else, which barely moves ------------------------------- */
  const workers = P.workers.flat + Math.max(0, api - P.workers.includedReq) / 1e6 * P.workers.perM;
  const lambdaGbs = api * 0.2 * 0.25;
  const lambda =
    Math.max(0, api - P.lambda.freeReq) * P.lambda.perReq +
    Math.max(0, lambdaGbs - P.lambda.freeGbs) * P.lambda.perGbs;
  const dynamo = writes * P.dynamo.wru + api * P.dynamo.rru;

  // Invites and a weekly digest, not a daily nudge. The crew already has a
  // group chat; that IS the notification channel, and it costs nothing.
  const emailsMo = people * 1.5;
  const sesCost = (emailsMo / 1000) * P.ses.per1k;
  const resendCost = (emailsMo / 1000) * P.resend.per1k;

  const stripe = (tier.crews * (tier.priceYr * P.stripe.pct + P.stripe.fixed)) / 12;

  const lean = mapStatic + workers + 0 /* D1 free */ + sesCost + 1 /* domain */;
  const leanTiles = mapR2 + workers + 0 + sesCost + 1;
  const heavy = mapMapbox + 20 /* Vercel Pro */ + 19 /* Neon */ + resendCost + 1;
  const geoguessr = heavy + streetview;

  return { tier, people, sessions, tiles, api, revenueMo, lean, leanTiles, heavy, geoguessr, stripe,
           parts: { mapR2, mapMapbox, streetview, workers, lambda, dynamo, sesCost, resendCost } };
}

const rows = TIERS.map(model);

// console.log supports %s and %d but not printf width specifiers, so pad by hand.
const L = (s, n) => String(s).padEnd(n);
const R = (s, n) => String(s).padStart(n);
const head = (label) => console.log(L(label, 34) + rows.map((r) => R(r.tier.name, 11)).join(""));
const line = (label, pick) => console.log(L(label, 34) + rows.map((r) => R(money(pick(r)), 11)).join(""));
const rule = () => console.log("-".repeat(67));

console.log(
  `\nASSUMPTIONS  crews of ${USAGE.membersPerCrew}, ` +
    `${USAGE.sessionsPerPersonPerDay} session/person/day, ${USAGE.daysPerMonth} days/mo\n`
);

console.log(L("tier", 10) + R("people", 9) + R("sessions/mo", 13) + R("revenue/mo", 13));
console.log("-".repeat(45));
for (const r of rows) {
  console.log(
    L(r.tier.name, 10) + R(r.people.toLocaleString(), 9) +
    R(r.sessions.toLocaleString(), 13) + R(money(r.revenueMo), 13)
  );
}

console.log("\nMONTHLY INFRASTRUCTURE, by architecture\n");
head("stack");
rule();
line("A  static geometry (CF+SES)", (r) => r.lean);
line("B  self-host tiles, R2 (CF+SES)", (r) => r.leanTiles);
line("C  hosted tiles (Mapbox+Vercel)", (r) => r.heavy);
line("D  street-level imagery", (r) => r.geoguessr);

console.log("\nMAP COMPONENT ALONE - the decision that swings everything\n");
head("option");
rule();
line("static geometry", () => 0);
line("PMTiles on R2", (r) => r.parts.mapR2);
line("Mapbox map loads", (r) => r.parts.mapMapbox);
line("Google Street View", (r) => r.parts.streetview);

console.log("\nWHAT ACTUALLY DOMINATES\n");
head("");
rule();
line("infrastructure (option A)", (r) => r.lean);
line("Stripe fees", (r) => r.stripe);
line("revenue", (r) => r.revenueMo);

console.log();
for (const r of rows) {
  const both = ((r.lean + r.stripe) / r.revenueMo) * 100;
  const infra = (r.lean / r.revenueMo) * 100;
  console.log(
    `  ${L(r.tier.name, 9)}infra + Stripe = ${both.toFixed(1)}% of revenue` +
      `   (infra alone ${infra.toFixed(2)}%)`
  );
}

/* ===========================================================================
   VOICE
   A ~45-second spoken "dispatch" about today's place, played AFTER the guess.
   The same structural lesson as the map: in a daily game every player gets the
   SAME round, so the audio is generated once and served as a file. Generating
   it per request buys nothing and costs four thousand times more.
   =========================================================================== */
const VOICE = { words: 150, charsPerWord: 6, roundsPerMonth: 30, liveMinutesPerSession: 2 };
const charsPerRound = VOICE.words * VOICE.charsPerWord;

console.log("\n\nVOICE, IF IT IS EVER ADDED\n");
console.log(
  `  a ${VOICE.words}-word post-round dispatch = ${charsPerRound.toLocaleString()} characters\n`
);

const ttsCost = (chars, rate, freeChars = 0) => (Math.max(0, chars - freeChars) / 1e6) * rate;

head("approach");
rule();

// Batched: 30 rounds a month, one render each, served as a static file.
const batchedChars = charsPerRound * VOICE.roundsPerMonth;
line("batch once/round, Standard voice", () => ttsCost(batchedChars, P.tts.standard, P.tts.freeStandardChars));
line("batch once/round, Chirp 3 HD", () => ttsCost(batchedChars, P.tts.chirpHd));

// Per request: the same words, re-synthesised for every single player.
line("per user, Standard voice", (r) => ttsCost(r.sessions * charsPerRound, P.tts.standard, P.tts.freeStandardChars));
line("per user, Neural2", (r) => ttsCost(r.sessions * charsPerRound, P.tts.neural2));
line("per user, Chirp 3 HD", (r) => ttsCost(r.sessions * charsPerRound, P.tts.chirpHd));

// Conversational: a live voice agent per session.
line("Gemini Live, 2 min/session", (r) => r.sessions * VOICE.liveMinutesPerSession * P.geminiLive.perMinute);

console.log();
const t = rows[1]; // Target tier
const batched = ttsCost(batchedChars, P.tts.chirpHd);
const perUser = ttsCost(t.sessions * charsPerRound, P.tts.chirpHd);
const live = t.sessions * VOICE.liveMinutesPerSession * P.geminiLive.perMinute;
console.log(`  At Target, identical audio: batched ${money(batched)} vs per-user ${money(perUser)}`);
console.log(`  That is a ${Math.round(perUser / Math.max(batched, 0.01)).toLocaleString()}x difference for the same words.`);
console.log(`  Gemini Live conversational: ${money(live)}/mo = ${(live / t.revenueMo * 100).toFixed(0)}% of revenue.`);
console.log(`  Writing the scripts with Gemini Flash: ${money((30 * 1000 / 1e6) * P.geminiFlashText.perMTokens)}/mo (rounding error).`);
console.log();
