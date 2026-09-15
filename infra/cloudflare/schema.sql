-- Cairn signups.
--
-- `email` is the primary key, which buys deduplication for free: a second
-- submission from the same person is an INSERT OR IGNORE that changes nothing.
-- The first answer wins, so a blank retry can never erase the crew somebody
-- named the first time.
--
-- `named_a_crew` is computed on arrival rather than derived later, so the
-- decision in docs/validation.md does not depend on anyone re-reading free
-- text months afterwards.

CREATE TABLE IF NOT EXISTS signups (
  email        TEXT PRIMARY KEY,
  crew         TEXT NOT NULL DEFAULT '',
  src          TEXT NOT NULL DEFAULT 'direct',
  named_a_crew INTEGER NOT NULL DEFAULT 0,
  country      TEXT,
  ua           TEXT,
  ts           TEXT NOT NULL
);

-- The two questions actually asked of this table: how many per source, and
-- how many named a crew.
CREATE INDEX IF NOT EXISTS signups_src ON signups (src);
CREATE INDEX IF NOT EXISTS signups_named ON signups (named_a_crew);
