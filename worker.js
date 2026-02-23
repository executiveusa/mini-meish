// Mini Meish Defense Dashboard — Cloudflare Worker API
// Handles D1 persistence for all app state, logs, ledger, and attorneys

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ── APP STATE (key-value) ───────────────────────────────────
      if (path === '/api/state' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT key, value FROM app_state').all();
        const state = {};
        for (const row of rows.results) {
          try { state[row.key] = JSON.parse(row.value); } catch { state[row.key] = row.value; }
        }
        return json(state, corsHeaders);
      }

      if (path === '/api/state' && method === 'POST') {
        const body = await request.json();
        const stmt = env.DB.prepare(
          'INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
        );
        const batch = [];
        for (const [k, v] of Object.entries(body)) {
          batch.push(stmt.bind(k, JSON.stringify(v)));
        }
        if (batch.length > 0) await env.DB.batch(batch);
        return json({ ok: true }, corsHeaders);
      }

      // ── LOGS ────────────────────────────────────────────────────
      if (path === '/api/logs' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM logs ORDER BY created_at DESC').all();
        return json(rows.results, corsHeaders);
      }

      if (path === '/api/logs' && method === 'POST') {
        const body = await request.json();
        await env.DB.prepare(
          'INSERT INTO logs (id, contact, channel, summary, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(body.id, body.contact || '', body.channel || 'PHONE', body.summary || '', body.outcome || '', body.at || new Date().toISOString()).run();
        return json({ ok: true }, corsHeaders);
      }

      if (path.startsWith('/api/logs/') && method === 'DELETE') {
        const id = path.split('/api/logs/')[1];
        await env.DB.prepare('DELETE FROM logs WHERE id = ?').bind(id).run();
        return json({ ok: true }, corsHeaders);
      }

      // ── LEDGER ──────────────────────────────────────────────────
      if (path === '/api/ledger' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM ledger ORDER BY created_at DESC').all();
        return json(rows.results, corsHeaders);
      }

      if (path === '/api/ledger' && method === 'POST') {
        const body = await request.json();
        await env.DB.prepare(
          'INSERT INTO ledger (id, type, amount, note, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
        ).bind(body.id, body.type, body.amount, body.note || '').run();
        return json({ ok: true }, corsHeaders);
      }

      if (path.startsWith('/api/ledger/') && method === 'DELETE') {
        const id = path.split('/api/ledger/')[1];
        await env.DB.prepare('DELETE FROM ledger WHERE id = ?').bind(id).run();
        return json({ ok: true }, corsHeaders);
      }

      // ── ATTORNEYS ───────────────────────────────────────────────
      if (path === '/api/attorneys' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM attorneys ORDER BY created_at DESC').all();
        return json(rows.results, corsHeaders);
      }

      if (path === '/api/attorneys' && method === 'POST') {
        const body = await request.json();
        await env.DB.prepare(
          `INSERT INTO attorneys (id, name, firm, phone, email, specialty, counties, flat_fee, notes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, firm = excluded.firm, phone = excluded.phone,
             email = excluded.email, specialty = excluded.specialty, counties = excluded.counties,
             flat_fee = excluded.flat_fee, notes = excluded.notes, status = excluded.status`
        ).bind(
          body.id, body.name, body.firm || '', body.phone || '', body.email || '',
          body.specialty || '', body.counties || '', body.flat_fee ? 1 : 0,
          body.notes || '', body.status || 'contacted'
        ).run();
        return json({ ok: true }, corsHeaders);
      }

      if (path.startsWith('/api/attorneys/') && method === 'DELETE') {
        const id = path.split('/api/attorneys/')[1];
        await env.DB.prepare('DELETE FROM attorneys WHERE id = ?').bind(id).run();
        return json({ ok: true }, corsHeaders);
      }

      // ── FALLBACK: serve static assets ───────────────────────────
      return env.ASSETS.fetch(request);

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

function json(data, corsHeaders) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
