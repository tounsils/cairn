-- Crews and plays.
--
-- The whole experiment is the funnel between these two tables: how many people
-- play, how many of those create a crew, and how many crews get a second
-- person. `signups` from the landing-page version stays as-is; nothing here
-- touches it.

CREATE TABLE IF NOT EXISTS crews (
  id         TEXT PRIMARY KEY,   -- short, hand-typable, no 0/O/1/I/l
  created_at TEXT NOT NULL,
  src        TEXT NOT NULL DEFAULT 'direct'
);

CREATE TABLE IF NOT EXISTS plays (
  id          TEXT PRIMARY KEY,
  crew_id     TEXT,              -- NULL until the player creates or joins a crew
  player      TEXT NOT NULL DEFAULT '',
  round_id    TEXT NOT NULL,
  guess_lng   REAL NOT NULL,
  guess_lat   REAL NOT NULL,
  distance_mi INTEGER NOT NULL,
  src         TEXT NOT NULL DEFAULT 'direct',
  created_at  TEXT NOT NULL
);

-- The board reads plays by crew, ordered by distance. The funnel counts plays
-- by crew. Both want the same index.
CREATE INDEX IF NOT EXISTS plays_crew ON plays (crew_id);
CREATE INDEX IF NOT EXISTS plays_src ON plays (src);
