// Setup Supabase tables via Management API
const https = require('https');

const ACCESS_TOKEN = 'sbp_2295b22d756e0a11f74a0f159cda20761a689638';
const PROJECT_REF = 'nfhejlqgvghzafrnmpsl';

const SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contact TEXT,
  channel TEXT,
  summary TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL,
  amount NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attorneys (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  firm TEXT,
  phone TEXT,
  email TEXT,
  specialty TEXT,
  counties TEXT,
  flat_fee INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'contacted',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_memory (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE attorneys ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_app_state') THEN
    CREATE POLICY anon_all_app_state ON app_state FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_logs') THEN
    CREATE POLICY anon_all_logs ON logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_ledger') THEN
    CREATE POLICY anon_all_ledger ON ledger FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_attorneys') THEN
    CREATE POLICY anon_all_attorneys ON attorneys FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_chat_messages') THEN
    CREATE POLICY anon_all_chat_messages ON chat_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_chat_memory') THEN
    CREATE POLICY anon_all_chat_memory ON chat_memory FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.supabase.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        } else {
          try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Listing projects...');
  const projects = await request('GET', '/v1/projects');
  console.log('Projects:', projects.map(p => `${p.id} (${p.name}) status=${p.status}`).join(', '));

  const proj = projects.find(p => p.id === PROJECT_REF);
  if (!proj) {
    console.error(`Project ${PROJECT_REF} not found!`);
    process.exit(1);
  }
  console.log(`\nUsing project: ${proj.name} (${proj.id}) status=${proj.status}`);
  console.log('Region:', proj.region);

  if (proj.status === 'INACTIVE_PAUSED' || proj.status !== 'ACTIVE_HEALTHY') {
    console.log('\nProject is paused. Restoring...');
    try {
      await request('POST', `/v1/projects/${PROJECT_REF}/restore`);
      console.log('Restore initiated.');
    } catch (e) {
      console.log('Restore result:', e.message);
    }
    // Poll for active status
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 10000));
      const ps = await request('GET', '/v1/projects');
      const p2 = ps.find(p => p.id === PROJECT_REF);
      console.log(`  [${(i+1)*10}s] Status: ${p2?.status}`);
      if (p2?.status === 'ACTIVE_HEALTHY') { console.log('Project restored!'); break; }
    }
  }

  console.log('\nCreating tables...');
  const result = await request('POST', `/v1/projects/${PROJECT_REF}/database/query`, { query: SQL });
  console.log('Result:', JSON.stringify(result, null, 2));

  console.log('\nVerifying tables...');
  const verify = await request('POST', `/v1/projects/${PROJECT_REF}/database/query`, {
    query: "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  });
  console.log('Tables:', JSON.stringify(verify, null, 2));

  // Get API keys
  console.log('\nFetching API keys...');
  const keys = await request('GET', `/v1/projects/${PROJECT_REF}/api-keys`);
  for (const k of keys) {
    console.log(`${k.name}: ${k.api_key}`);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
