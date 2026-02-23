-- App state (key-value for tasks, contacts, bond facts, task checks)
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Communication logs
CREATE TABLE IF NOT EXISTS logs (
  id         TEXT PRIMARY KEY,
  contact    TEXT,
  channel    TEXT,
  summary    TEXT,
  outcome    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Financial ledger
CREATE TABLE IF NOT EXISTS ledger (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  amount     REAL,
  note       TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Attorney tracker
CREATE TABLE IF NOT EXISTS attorneys (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  firm       TEXT,
  phone      TEXT,
  email      TEXT,
  specialty  TEXT,
  counties   TEXT,
  flat_fee   INTEGER DEFAULT 0,
  notes      TEXT,
  status     TEXT DEFAULT 'contacted',
  created_at TEXT DEFAULT (datetime('now'))
);
