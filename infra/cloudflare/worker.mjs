/**
 * Cairn signup collector — Cloudflare Worker over D1.
 *
 * This exists because the other two backends were both blocked on an account
 * login: Apps Script needs a browser session, and the AWS keys are revoked.
 * Wrangler was already authenticated, so this is the path that could actually
 * be deployed rather than documented.
 *
 * The validation rules are imported from ../lib/signup.mjs, which is pure and
 * unit tested. This file is transport only: CORS, parse, delegate, persist.
 */

import { LIMITS, buildSignup, namedACrew } from "../lib/signup.mjs";

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    if (method === "GET") {
      // Makes the endpoint testable from a browser without writing anything.
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM signups").first();
      return json({ ok: true, service: "cairn-signup", rows: row?.n ?? 0 }, 200, origin);
    }

    if (method !== "POST") return json({ ok: false, error: "use POST" }, 405, origin);

    // Cap before parsing: an oversized body should cost a length check rather
    // than a JSON parse of whatever someone decided to send.
    const raw = await request.text();
    if (raw.length > LIMITS.body) return json({ ok: false, error: "body too large" }, 413, origin);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "body must be JSON" }, 400, origin);
    }

    const built = buildSignup(payload, {
      userAgent: request.headers.get("user-agent"),
      country: request.headers.get("cf-ipcountry"),
      now: new Date().toISOString(),
    });

    // A filtered bot gets the same response a person gets. Telling a scraper
    // it was caught only teaches it what to change next time.
    if (!built.ok) {
      return built.silent
        ? json({ ok: true }, 200, origin)
        : json({ ok: false, error: built.reason }, built.status, origin);
    }

    const r = built.record;
    try {
      // INSERT OR IGNORE: the first answer wins. A second submission from the
      // same address must not overwrite the crew they named the first time.
      await env.DB.prepare(
        `INSERT OR IGNORE INTO signups (email, crew, src, named_a_crew, country, ua, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(r.email, r.crew, r.src, namedACrew(r.crew) ? 1 : 0, r.country, r.ua, r.ts)
        .run();
    } catch (err) {
      console.error("d1 insert failed", err);
      return json({ ok: false, error: "could not save that, try once more" }, 500, origin);
    }

    // Duplicates return the same success as a new signup, so the endpoint
    // cannot be used to test whether an address is already on the list.
    return json({ ok: true }, 200, origin);
  },
};
