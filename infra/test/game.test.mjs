/**
 * Tests for the round maths.
 *
 * The distance is the only number a player is given, and it is the number
 * their family compares themselves against on the board. Getting it wrong is
 * not a cosmetic bug; it is the product lying about the one thing it measures.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  ROUND,
  arrow,
  band,
  bearing,
  closeness,
  compass,
  distanceMiles,
  isValidGuess,
  makeId,
  rankPlays,
  scoreGuess,
} from "../lib/game.mjs";

const TIMBUKTU = { lng: ROUND.lng, lat: ROUND.lat };

/* --- distance ------------------------------------------------------------- */
test("a guess on the target is zero miles away", () => {
  assert.equal(Math.round(distanceMiles(TIMBUKTU, TIMBUKTU)), 0);
});

test("distances match known real-world values", () => {
  // Checked against published great-circle figures, within 1%.
  const pairs = [
    [{ lng: -0.1276, lat: 51.5072 }, { lng: 2.3522, lat: 48.8566 }, 214], // London-Paris
    [{ lng: -74.006, lat: 40.7128 }, { lng: -0.1276, lat: 51.5072 }, 3459], // NYC-London
    [{ lng: -118.2437, lat: 34.0522 }, { lng: -74.006, lat: 40.7128 }, 2451], // LA-NYC
  ];
  for (const [a, b, expected] of pairs) {
    const got = distanceMiles(a, b);
    assert.ok(
      Math.abs(got - expected) / expected < 0.01,
      `expected ~${expected} mi, got ${Math.round(got)}`,
    );
  }
});

test("distance is symmetric", () => {
  const a = { lng: -118.24, lat: 34.05 };
  assert.equal(Math.round(distanceMiles(a, TIMBUKTU)), Math.round(distanceMiles(TIMBUKTU, a)));
});

test("antipodal points are about half the earth's circumference apart", () => {
  const miles = distanceMiles({ lng: 0, lat: 0 }, { lng: 180, lat: 0 });
  assert.ok(Math.abs(miles - 12437) < 60, `got ${Math.round(miles)}`);
});

test("the dateline is not a wall", () => {
  // Two points 2 degrees apart across +/-180 must not read as most of a planet.
  const miles = distanceMiles({ lng: 179, lat: 0 }, { lng: -179, lat: 0 });
  assert.ok(miles < 200, `crossing the dateline gave ${Math.round(miles)} mi`);
});

/* --- direction ------------------------------------------------------------ */
test("bearings point the way a person would say it", () => {
  const origin = { lng: 0, lat: 0 };
  assert.equal(compass(bearing(origin, { lng: 0, lat: 10 })), "N");
  assert.equal(compass(bearing(origin, { lng: 10, lat: 0 })), "E");
  assert.equal(compass(bearing(origin, { lng: 0, lat: -10 })), "S");
  assert.equal(compass(bearing(origin, { lng: -10, lat: 0 })), "W");
});

test("compass handles wrap-around at north", () => {
  assert.equal(compass(0), "N");
  assert.equal(compass(360), "N");
  assert.equal(compass(359), "N");
  assert.equal(compass(-1), "N");
});

test("every bearing yields an arrow, and it agrees with the label", () => {
  // The glyph and the words must never disagree on screen.
  for (let deg = 0; deg < 720; deg += 7) {
    const a = arrow(deg);
    assert.ok(a, `no arrow for ${deg}`);
    assert.equal(a, arrow(compassToDeg(compass(deg))));
  }
  function compassToDeg(point) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(point) * 45;
  }
});

/* --- closeness bar -------------------------------------------------------- */
test("closeness is bounded and oriented", () => {
  assert.equal(closeness(0), 100);
  assert.equal(closeness(10), 100);
  assert.equal(closeness(99999), 0);
  for (const mi of [26, 100, 500, 2000, 7000]) {
    const c = closeness(mi);
    assert.ok(c >= 0 && c <= 100, `${mi} mi gave ${c}`);
  }
});

test("closeness decreases monotonically with distance", () => {
  let previous = 101;
  for (const mi of [0, 25, 50, 200, 800, 3000, 8000]) {
    const c = closeness(mi);
    assert.ok(c <= previous, `${mi} mi (${c}) should not exceed the previous ${previous}`);
    previous = c;
  }
});

test("wrong-continent guesses are still distinguishable from each other", () => {
  // The reason the scale is logarithmic. Linear would flatten every one of
  // these to nearly the same empty bar, and the board exists to compare them.
  assert.ok(closeness(2000) - closeness(6000) > 10);
});

test("nonsense distances do not produce a bar", () => {
  for (const bad of [NaN, -1, Infinity, undefined]) {
    assert.equal(closeness(bad), 0);
  }
});

/* --- guard rails ---------------------------------------------------------- */
test("rejects coordinates that are not on earth", () => {
  for (const bad of [
    null, undefined, {}, "here",
    { lng: 0 }, { lat: 0 },
    { lng: 200, lat: 0 }, { lng: 0, lat: 91 }, { lng: -181, lat: 0 },
    { lng: NaN, lat: 0 }, { lng: 0, lat: Infinity },
  ]) {
    assert.equal(isValidGuess(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("accepts the edges of the coordinate system", () => {
  for (const good of [
    { lng: -180, lat: -90 }, { lng: 180, lat: 90 }, { lng: 0, lat: 0 },
  ]) {
    assert.equal(isValidGuess(good), true);
  }
});

test("an invalid guess scores null rather than a plausible number", () => {
  // A broken client must not be able to write nonsense onto a board other
  // people are reading and comparing themselves against.
  assert.equal(scoreGuess({ lng: 999, lat: 999 }), null);
  assert.equal(scoreGuess(null), null);
});

/* --- scoring end to end --------------------------------------------------- */
test("guessing the target exactly reads as spot on", () => {
  const r = scoreGuess(TIMBUKTU);
  assert.equal(r.distanceMi, 0);
  assert.equal(r.closeness, 100);
  assert.equal(r.band, "spot on");
});

test("a guess in the wrong hemisphere is not flattered", () => {
  const r = scoreGuess({ lng: -74.006, lat: 40.7128 }); // New York
  assert.ok(r.distanceMi > 4000, `got ${r.distanceMi}`);
  assert.equal(r.band, "not close");
  assert.ok(r.closeness < 30);
});

test("the direction points from the guess toward the answer", () => {
  // Guess well north of Timbuktu: the answer is to the south.
  assert.equal(scoreGuess({ lng: -3.0, lat: 40.0 }).compass, "S");
  // Guess well west: the answer is to the east.
  assert.equal(scoreGuess({ lng: -40.0, lat: 16.77 }).compass, "E");
});

test("every score field is present and sane for arbitrary guesses", () => {
  for (let lng = -180; lng <= 180; lng += 37) {
    for (let lat = -80; lat <= 80; lat += 23) {
      const r = scoreGuess({ lng, lat });
      assert.ok(Number.isInteger(r.distanceMi) && r.distanceMi >= 0);
      assert.ok(r.bearing >= 0 && r.bearing <= 360);
      assert.ok(r.closeness >= 0 && r.closeness <= 100);
      assert.ok(typeof r.band === "string" && r.band.length > 0);
    }
  }
});

/* --- crew board ----------------------------------------------------------- */
test("the board ranks closest first", () => {
  const ranked = rankPlays([
    { id: "b", distance_mi: 500 },
    { id: "a", distance_mi: 20 },
    { id: "c", distance_mi: 3000 },
  ]);
  assert.deepEqual(ranked.map((p) => p.id), ["a", "b", "c"]);
});

test("equal distances keep a stable order between refreshes", () => {
  const plays = [{ id: "z", distance_mi: 100 }, { id: "a", distance_mi: 100 }];
  assert.deepEqual(rankPlays(plays).map((p) => p.id), ["a", "z"]);
  assert.deepEqual(rankPlays([...plays].reverse()).map((p) => p.id), ["a", "z"]);
});

test("ranking does not mutate the caller's array", () => {
  const plays = [{ id: "b", distance_mi: 2 }, { id: "a", distance_mi: 1 }];
  rankPlays(plays);
  assert.equal(plays[0].id, "b");
});

/* --- invite ids ----------------------------------------------------------- */
test("ids avoid characters people misread when typing a link", () => {
  // A crew link landing on the WRONG crew is worse than one that 404s.
  const id = makeId(200);
  for (const ch of "01OIl") assert.ok(!id.includes(ch), `id contains ${ch}`);
});

test("ids are the requested length and use the full alphabet", () => {
  assert.equal(makeId(8).length, 8);
  assert.ok(new Set(makeId(400)).size > 15, "not enough spread to be random");
});

test("id generation is deterministic under an injected source", () => {
  const fixed = () => 0;
  assert.equal(makeId(5, fixed), "22222");
});
