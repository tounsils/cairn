/**
 * Cairn — game and crew API, on Cloudflare Workers over D1.
 *
 * The experiment is a funnel, and every endpoint here exists to move a visitor
 * one step along it or to measure that they did not:
 *
 *     played  ->  created a crew  ->  somebody else joined it
 *
 * The last arrow is the hypothesis. A daily geography puzzle is a solved,
 * crowded genre; the untested claim is that people want to play one AS A
 * GROUP. Intent was measured before by asking for an email, which needed more
 * traffic than this will ever get. This measures behaviour instead.
 *
 * Scoring lives in ../lib/game.mjs and validation in ../lib/signup.mjs, both
 * pure and unit tested. This file is transport, storage and CORS.
 */

import { ROUND, makeId, rankPlays, scoreGuess } from "../lib/game.mjs";
import { LIMITS, buildSignup, clean, cleanSrc, namedACrew } from "../lib/signup.mjs";

const MAX_NAME = 24;
const MAX_CREW_SIZE = 12; // generous; a real crew is 2-6

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

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > LIMITS.body) throw new Error("body too large");
  return JSON.parse(raw);
}

/** Display name. Empty is allowed and renders as "Someone" on the board. */
const cleanName = (value) => clean(value, MAX_NAME);

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    try {
      /* --- the round ----------------------------------------------------- */
      if (method === "GET" && path === "/round") {
        // The answer is NOT sent. A player who opens devtools should not be
        // able to read the coordinates before guessing.
        return json({ id: ROUND.id, prompt: ROUND.prompt, hint: ROUND.hint }, 200, origin);
      }

      /* --- play ----------------------------------------------------------- */
      if (method === "POST" && path === "/play") {
        const body = await readJson(request);
        const result = scoreGuess({ lng: Number(body.lng), lat: Number(body.lat) });
        if (!result) return json({ ok: false, error: "that is not a point on earth" }, 400, origin);

        const crewId = body.crewId ? clean(body.crewId, 16) : null;
        if (crewId) {
          const crew = await env.DB.prepare("SELECT id FROM crews WHERE id = ?").bind(crewId).first();
          if (!crew) return json({ ok: false, error: "that crew link is not valid" }, 404, origin);

          const { n } = await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM plays WHERE crew_id = ?",
          ).bind(crewId).first();
          if (n >= MAX_CREW_SIZE) {
            return json({ ok: false, error: "that crew is full" }, 409, origin);
          }
        }

        const playId = makeId(12);
        await env.DB.prepare(
          `INSERT INTO plays (id, crew_id, player, round_id, guess_lng, guess_lat, distance_mi, src, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            playId,
            crewId,
            cleanName(body.player),
            ROUND.id,
            Number(body.lng),
            Number(body.lat),
            result.distanceMi,
            cleanSrc(body.src),
            new Date().toISOString(),
          )
          .run();

        // The answer is revealed only once a guess is committed.
        return json(
          { ok: true, playId, result, answer: { lng: ROUND.lng, lat: ROUND.lat, reveal: ROUND.reveal } },
          200,
          origin,
        );
      }

      /* --- name, and optionally start a crew ------------------------------ */
      if (method === "POST" && path === "/finish") {
        const body = await readJson(request);
        const playId = clean(body.playId, 16);
        const play = await env.DB.prepare("SELECT id, crew_id FROM plays WHERE id = ?")
          .bind(playId)
          .first();
        if (!play) return json({ ok: false, error: "unknown play" }, 404, origin);

        const name = cleanName(body.player);
        if (name) {
          await env.DB.prepare("UPDATE plays SET player = ? WHERE id = ?").bind(name, playId).run();
        }

        // Creating a crew is the conversion this whole test is watching for.
        let crewId = play.crew_id;
        if (!crewId && body.createCrew) {
          crewId = makeId(8);
          await env.DB.prepare("INSERT INTO crews (id, created_at, src) VALUES (?, ?, ?)")
            .bind(crewId, new Date().toISOString(), cleanSrc(body.src))
            .run();
          await env.DB.prepare("UPDATE plays SET crew_id = ? WHERE id = ?").bind(crewId, playId).run();
        }

        return json({ ok: true, crewId }, 200, origin);
      }

      /* --- crew board ------------------------------------------------------ */
      if (method === "GET" && path.startsWith("/crew/")) {
        const crewId = clean(path.slice("/crew/".length), 16);
        const crew = await env.DB.prepare("SELECT id, created_at FROM crews WHERE id = ?")
          .bind(crewId)
          .first();
        if (!crew) return json({ ok: false, error: "no such crew" }, 404, origin);

        const { results } = await env.DB.prepare(
          `SELECT id, player, distance_mi, created_at FROM plays WHERE crew_id = ?`,
        )
          .bind(crewId)
          .all();

        return json(
          {
            ok: true,
            crew: { id: crew.id, createdAt: crew.created_at },
            plays: rankPlays(results ?? []).map((p) => ({
              id: p.id,
              player: p.player || "Someone",
              distanceMi: p.distance_mi,
              at: p.created_at,
            })),
          },
          200,
          origin,
        );
      }

      /* --- the funnel ------------------------------------------------------ */
      if (method === "GET" && (path === "/" || path === "/stats")) {
        const plays = await env.DB.prepare("SELECT COUNT(*) AS n FROM plays").first();
        const crews = await env.DB.prepare("SELECT COUNT(*) AS n FROM crews").first();
        const joined = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT crew_id FROM plays WHERE crew_id IS NOT NULL
             GROUP BY crew_id HAVING COUNT(*) >= 2
           )`,
        ).first();
        return json(
          {
            ok: true,
            service: "cairn",
            round: ROUND.id,
            plays: plays?.n ?? 0,
            crews: crews?.n ?? 0,
            crewsWithTwoOrMore: joined?.n ?? 0,
          },
          200,
          origin,
        );
      }

      /* --- the old landing-page signup, kept working ----------------------- */
      if (method === "POST" && path === "/signup") {
        const body = await readJson(request);
        const built = buildSignup(body, {
          userAgent: request.headers.get("user-agent"),
          country: request.headers.get("cf-ipcountry"),
          now: new Date().toISOString(),
        });
        if (!built.ok) {
          return built.silent
            ? json({ ok: true }, 200, origin)
            : json({ ok: false, error: built.reason }, built.status, origin);
        }
        const r = built.record;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO signups (email, crew, src, named_a_crew, country, ua, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(r.email, r.crew, r.src, namedACrew(r.crew) ? 1 : 0, r.country, r.ua, r.ts)
          .run();
        return json({ ok: true }, 200, origin);
      }

      return json({ ok: false, error: "not found" }, 404, origin);
    } catch (err) {
      console.error(path, err);
      const message = err?.message === "body too large" ? err.message : "something broke on our side";
      return json({ ok: false, error: message }, 500, origin);
    }
  },
};
