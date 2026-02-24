const { randomUUID } = require('crypto');

let PoolCtor = null;
try {
  ({ Pool: PoolCtor } = require('pg'));
} catch {
  PoolCtor = null;
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const hasPg = Boolean(PoolCtor && DATABASE_URL);
const pool = hasPg
  ? new PoolCtor({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

let initialized = false;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  contact TEXT,
  channel TEXT,
  summary TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attorneys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  firm TEXT,
  phone TEXT,
  email TEXT,
  specialty TEXT,
  counties TEXT,
  flat_fee INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'contacted',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assistant_tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'open',
  source TEXT DEFAULT 'assistant',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function query(sql, params = []) {
  if (!pool) {
    throw new Error('Postgres is not configured. Set DATABASE_URL (or POSTGRES_URL).');
  }
  return pool.query(sql, params);
}

async function init() {
  if (!pool || initialized) return;
  await query(SCHEMA_SQL);
  initialized = true;
}

async function getState() {
  await init();
  const { rows } = await query('SELECT key, value FROM app_state');
  const state = {};
  for (const row of rows) state[row.key] = row.value;
  return state;
}

async function patchState(patch) {
  await init();
  const entries = Object.entries(patch || {});
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value ?? null)]
    );
  }
}

async function listLogs() {
  await init();
  const { rows } = await query('SELECT * FROM logs ORDER BY created_at DESC');
  return rows;
}

async function addLog(entry) {
  await init();
  const id = entry.id || randomUUID();
  await query(
    'INSERT INTO logs (id, contact, channel, summary, outcome, created_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6,NOW()))',
    [id, entry.contact || '', entry.channel || 'PHONE', entry.summary || '', entry.outcome || '', entry.created_at || entry.at || null]
  );
  return id;
}

async function deleteLog(id) {
  await init();
  await query('DELETE FROM logs WHERE id = $1', [id]);
}

async function listLedger() {
  await init();
  const { rows } = await query('SELECT * FROM ledger ORDER BY created_at DESC');
  return rows;
}

async function addLedger(entry) {
  await init();
  const id = entry.id || randomUUID();
  await query(
    'INSERT INTO ledger (id, type, amount, note, created_at) VALUES ($1,$2,$3,$4,NOW())',
    [id, entry.type, entry.amount ?? null, entry.note || '']
  );
  return id;
}

async function deleteLedger(id) {
  await init();
  await query('DELETE FROM ledger WHERE id = $1', [id]);
}

async function listAttorneys() {
  await init();
  const { rows } = await query('SELECT * FROM attorneys ORDER BY created_at DESC');
  return rows;
}

async function upsertAttorney(att) {
  await init();
  const id = att.id || randomUUID();
  await query(
    `INSERT INTO attorneys (id, name, firm, phone, email, specialty, counties, flat_fee, notes, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, firm=EXCLUDED.firm, phone=EXCLUDED.phone, email=EXCLUDED.email,
       specialty=EXCLUDED.specialty, counties=EXCLUDED.counties, flat_fee=EXCLUDED.flat_fee,
       notes=EXCLUDED.notes, status=EXCLUDED.status`,
    [
      id,
      att.name || 'Unknown',
      att.firm || '',
      att.phone || '',
      att.email || '',
      att.specialty || '',
      att.counties || '',
      att.flat_fee ? 1 : 0,
      att.notes || '',
      att.status || 'contacted',
    ]
  );
  return id;
}

async function deleteAttorney(id) {
  await init();
  await query('DELETE FROM attorneys WHERE id = $1', [id]);
}

async function listChatMessages(limit = 50) {
  await init();
  const { rows } = await query(
    'SELECT role, content, created_at FROM chat_messages ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows.reverse();
}

async function addChatMessage(role, content) {
  await init();
  await query('INSERT INTO chat_messages (role, content, created_at) VALUES ($1,$2,NOW())', [role, content]);
}

async function listMemory(limit = 50) {
  await init();
  const { rows } = await query('SELECT key, value, updated_at FROM chat_memory ORDER BY updated_at DESC LIMIT $1', [limit]);
  return rows;
}

async function upsertMemory(key, value) {
  await init();
  await query(
    `INSERT INTO chat_memory (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

async function upsertProfileField(field, value) {
  await init();
  const allowed = new Set(['full_name', 'email', 'phone', 'location']);
  if (!allowed.has(field)) throw new Error(`Unsupported profile field: ${field}`);
  await query(
    `INSERT INTO profile (id, ${field}, updated_at)
     VALUES ('meish', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET ${field} = EXCLUDED.${field}, updated_at = NOW()`,
    [value]
  );
}

async function createAssistantTask(task) {
  await init();
  const { rows } = await query(
    'INSERT INTO assistant_tasks (title, details, status, source, due_at, created_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id',
    [task.title, task.details || '', task.status || 'open', task.source || 'assistant', task.due_at || null]
  );
  return rows[0]?.id;
}

async function listOpenAssistantTasks(limit = 25) {
  await init();
  const { rows } = await query(
    "SELECT * FROM assistant_tasks WHERE status = 'open' ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return rows;
}

module.exports = {
  hasPg,
  init,
  getState,
  patchState,
  listLogs,
  addLog,
  deleteLog,
  listLedger,
  addLedger,
  deleteLedger,
  listAttorneys,
  upsertAttorney,
  deleteAttorney,
  listChatMessages,
  addChatMessage,
  listMemory,
  upsertMemory,
  upsertProfileField,
  createAssistantTask,
  listOpenAssistantTasks,
};
