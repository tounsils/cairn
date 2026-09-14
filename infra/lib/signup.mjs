/**
 * Signup rules. Pure functions, no AWS, no network, no clock of their own.
 *
 * This is the part that can be wrong in a way that costs real signups, so it
 * lives apart from the transport and is tested on its own. The Lambda handler
 * and the Apps Script backend both implement these same rules; this module is
 * the canonical statement of them.
 *
 * The bias throughout is: when in doubt, ACCEPT. A validation test that
 * silently drops a real person's answer produces a false negative, and a false
 * negative here means killing an idea that was actually working.
 */

export const LIMITS = {
  email: 254, // RFC 5321 maximum path length
  crew: 500, // free text; generous, but not a place to paste a novel
  src: 64,
  ua: 200,
  body: 8 * 1024, // whole payload cap, before parsing
};

/**
 * Deliberately permissive. Strict RFC 5322 regexes reject real addresses
 * (plus-addressing, new TLDs, unicode locals) and every rejection here is a
 * lost data point. The only job is to exclude things that are obviously not
 * an address at all.
 */
export function isPlausibleEmail(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 6 || v.length > LIMITS.email) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@")) return false;
  const domain = v.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  return /^[^@]+@[^@]+\.[A-Za-z]{2,}$/.test(v);
}

/** Lowercase and trim so the same person cannot be counted twice. */
export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function clean(value, max) {
  return String(value ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ") // control chars, incl. CR and LF
    .replace(/\s+/g, " ")                  // a CRLF became two spaces; collapse runs
    .trim()
    .slice(0, max);
}

/**
 * Source tag from the ?src= parameter. Constrained to a slug so a crafted
 * link cannot inject anything into the notification email or the export.
 */
export function cleanSrc(value) {
  const v = clean(value, LIMITS.src)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-"); // "/r/" became "--"; one separator is enough
  return v.replace(/^-+|-+$/g, "") || "direct";
}

/**
 * Two cheap bot filters that cost a real user nothing.
 *
 *  1. Honeypot: a field hidden from humans. Anything in it came from a bot
 *     that filled every input on the page.
 *  2. Time trap: a human cannot read this page and submit in under two
 *     seconds. `elapsedMs` comes from the client so it is advisory, not
 *     security, which is why it only has to catch the lazy case.
 *
 * Neither is a CAPTCHA and neither is trying to be. The goal is to keep the
 * spreadsheet readable, not to repel a determined attacker.
 */
export const MIN_ELAPSED_MS = 2000;

export function looksAutomated({ honeypot, elapsedMs }) {
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { automated: true, why: "honeypot" };
  }
  // > 0, not >= 0: Number(null) and Number(undefined-ish) collapse to 0, and
  // treating that as an instant submission silently drops real people whose
  // client never sent a timer. Zero means unknown, and unknown is accepted.
  if (Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs < MIN_ELAPSED_MS) {
    return { automated: true, why: "too-fast" };
  }
  return { automated: false, why: null };
}

/**
 * Validate and shape one submission.
 *
 * Returns { ok, status, record, reason }. A rejected bot gets `status: 200`
 * on purpose: telling a scraper which of its submissions were filtered just
 * teaches it what to change.
 */
export function buildSignup(payload, meta = {}) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, reason: "body must be a JSON object" };
  }

  const bot = looksAutomated({
    honeypot: payload.website,
    elapsedMs: Number(payload.elapsedMs),
  });
  if (bot.automated) {
    return { ok: false, status: 200, reason: `filtered:${bot.why}`, silent: true };
  }

  const email = normaliseEmail(payload.email);
  if (!isPlausibleEmail(email)) {
    return { ok: false, status: 400, reason: "that email address does not look complete" };
  }

  return {
    ok: true,
    status: 200,
    record: {
      email,
      crew: clean(payload.crew, LIMITS.crew),
      src: cleanSrc(payload.src),
      ua: clean(meta.userAgent, LIMITS.ua),
      country: clean(meta.country, 8),
      ts: meta.now ?? new Date().toISOString(),
    },
  };
}

/**
 * The number the validation test actually turns on: what share of signups
 * named a crew. Under 20% is a kill at any volume, per docs/validation.md.
 *
 * A single word is not a crew. "yes", "me", "idk" are people being polite,
 * and counting them would flatter the result into a false pass.
 */
export function namedACrew(crew) {
  const v = String(crew ?? "").trim();
  if (v.length < 4) return false;
  if (/^(yes|no|na|n\/a|idk|me|none|maybe|test)$/i.test(v)) return false;
  return /\s/.test(v) || v.length >= 8;
}

export function summarise(records) {
  const total = records.length;
  const named = records.filter((r) => namedACrew(r.crew)).length;
  const bySrc = {};
  for (const r of records) bySrc[r.src] = (bySrc[r.src] || 0) + 1;

  // Personal-network signups are reported apart from cold ones, because
  // friends sign up out of kindness and mixing them turns a no into a yes.
  const warm = records.filter((r) => /^(personal|friends|family|linkedin)/.test(r.src)).length;

  return {
    total,
    named,
    namedPct: total ? Math.round((named / total) * 1000) / 10 : 0,
    cold: total - warm,
    warm,
    bySrc,
  };
}
