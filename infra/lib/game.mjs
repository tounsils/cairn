/**
 * The round, and the maths behind a guess.
 *
 * Pure. No map, no network, no storage. The distance a player is told is the
 * single number the whole experience turns on, so it lives apart from the
 * rendering and is tested on its own.
 *
 * One fixed round on purpose. A generator and an eval corpus are the six-month
 * version; this exists to find out whether anybody invites a second person.
 */

/**
 * Timbuktu, Mali.
 *
 * Chosen because "from here to Timbuktu" is an English idiom for impossibly
 * far, so almost everyone knows the name and almost nobody can place it. That
 * produces a wide spread of guesses, which is what makes a crew board worth
 * looking at: a round everyone gets right has nothing to compare.
 */
export const ROUND = Object.freeze({
  id: "r1-timbuktu",
  prompt: "Timbuktu",
  hint: "Drop a pin where you think it is.",
  lng: -3.0026,
  lat: 16.7666,
  reveal: "Timbuktu, Mali. A trading city on the southern edge of the Sahara.",
});

const EARTH_RADIUS_MI = 3958.8;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Great-circle distance in miles. */
export function distanceMiles(from, to) {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from one point to another, degrees clockwise from north. */
export function bearing(from, to) {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Eight-point compass label. Enough to say "you were south of it". */
export function compass(deg) {
  const normalised = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(normalised / 45) % 8];
}

/**
 * Arrow the UI draws. Same information as `compass`, kept separate so the
 * text and the glyph can never drift apart.
 */
export function arrow(deg) {
  return { N: "↑", NE: "↗", E: "→", SE: "↘", S: "↓", SW: "↙", W: "←", NW: "↖" }[compass(deg)];
}

/**
 * 0-100 for the progress bar on the crew board.
 *
 * Logarithmic, not linear. Linear would render every guess on the wrong
 * continent as an identical empty bar, which is exactly the comparison the
 * board exists to show. 25 miles is the point where the difference stops
 * mattering and 8000 is roughly the far side of the planet.
 */
const NEAR_MI = 25;
const FAR_MI = 8000;

export function closeness(miles) {
  if (!Number.isFinite(miles) || miles < 0) return 0;
  if (miles <= NEAR_MI) return 100;
  if (miles >= FAR_MI) return 0;
  const t = Math.log(miles / NEAR_MI) / Math.log(FAR_MI / NEAR_MI);
  return Math.round((1 - t) * 100);
}

/** Wording for the result line. Flat, not congratulatory. */
export function band(miles) {
  if (miles <= 25) return "spot on";
  if (miles <= 150) return "very close";
  if (miles <= 600) return "the right region";
  if (miles <= 2000) return "the right continent, roughly";
  return "not close";
}

/** Reject anything that is not a real point on earth. */
export function isValidGuess(guess) {
  if (!guess || typeof guess !== "object") return false;
  const { lng, lat } = guess;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

/**
 * Score one guess against the round. Returns null for an invalid guess rather
 * than a plausible-looking number, so a broken client cannot write nonsense
 * onto a crew board that other people are reading.
 */
export function scoreGuess(guess, round = ROUND) {
  if (!isValidGuess(guess)) return null;
  const target = { lng: round.lng, lat: round.lat };
  const miles = distanceMiles(guess, target);
  const deg = bearing(guess, target);
  return {
    distanceMi: Math.round(miles),
    bearing: Math.round(deg),
    compass: compass(deg),
    arrow: arrow(deg),
    closeness: closeness(miles),
    band: band(miles),
  };
}

/**
 * Crew board ordering: closest first, and a stable tiebreak so two identical
 * distances do not swap places between refreshes.
 */
export function rankPlays(plays) {
  return [...plays].sort(
    (a, b) => a.distance_mi - b.distance_mi || String(a.id).localeCompare(String(b.id)),
  );
}

/**
 * Short, unambiguous id for an invite link.
 *
 * No 0/O/1/I/l: these get read aloud and typed by hand, and a crew link that
 * lands on the wrong crew is worse than one that 404s.
 */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function makeId(length = 8, random = Math.random) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}
