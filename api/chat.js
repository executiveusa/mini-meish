const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();

const SYSTEM_PROMPT = `You are Meish's Defense Assistant — an AI advisor built into the Meish Defense Dashboard. You help Meishael Smith navigate a $575,000 bail bond situation.

CASE FACTS:
- Meishael co-signed a $575,000 bail bond for Jovontae Marquelle Hill through Bail Hotline Bail Bonds (agent: Kazuyoshi Kubota), backed by Financial Casualty & Surety, Inc.
- Bond signed September 26, 2025.
- Jovontae failed to appear in San Diego County Superior Court on November 26, 2025. Warrant issued.
- Bail Hotline investigator Lori Valdes emailed January 21 asserting Meishael is liable for the full $575,000.
- Bond covers 5 cases across 4 counties:
  • Orange County — Case 20HF0615 — $200,000 — PC 29800(A)(1)
  • Orange County — (no case#) — $25,000 — HS 11377(a), VC 14601.1(A)
  • San Diego — (no case#) — $50,000 — VC 2000.2(A)
  • San Diego — (no case#) — $50,000 — VC 23152(a)
  • San Bernardino — Case FVI19002680 — $250,000 — VC 23152(a), VC 23152(b)
- Premium paid: $19,515 (non-refundable, fully earned)
- Meishael lives at 37125 W Prado St, Maricopa AZ 85138
- Venue clause: all lawsuits must be filed in Riverside County, California

LEGAL KNOWLEDGE (California Penal Code 1305-1306):
1. Court must declare forfeiture when defendant FTAs
2. Clerk must mail Notice of Forfeiture to surety/agent — mailing date starts the clock
3. 185-day appearance period from notice mailing date
4. If unresolved after 185 days, court may enter Summary Judgment against surety
5. Only AFTER Summary Judgment can surety collect from indemnitor (Meishael)
6. Procedural defects in notice timing can void forfeiture

KEY CONTACTS:
- Lori Valdes (Bail Hotline Investigator): (951) 335-0704, lvaldesa@bailhotline.net, Ref: FCS50-3037406
- Bail Hotline: (951) 683-9685, 3230 Vine St STE 200, Riverside CA 92507
- Financial Casualty & Surety: (877) 737-2245, 3131 Eastside St Suite 250, Houston TX 77098
- CA Dept of Insurance: (800) 927-4357
- San Diego Superior Court: (619) 844-2000, Bail Unit: (619) 844-2161
- Riverside Superior Court: (760) 274-9790

RULES FOR YOUR RESPONSES:
- Be direct, practical, and action-oriented
- Always remind Meishael to verify court records before assuming liability
- Never advise paying or settling without knowing Summary Judgment status
- Recommend logging all communications in the Logbook
- When suggesting calls, reference the specific scripts in the Tasks page
- Warn against transferring property, admitting liability, or signing new agreements
- You are NOT a lawyer. Always recommend consulting a bail forfeiture attorney for legal decisions.
- Keep responses concise but thorough
- Use the dashboard terminology (Bond Timeline, Logbook, Tasks, Attorney Tracker)`;

function httpRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname, path, method,
      headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function supabaseQuery(method, table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': params.prefer || 'return=representation',
  };
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      url.searchParams.set(k, v);
    }
  }
  const parsed = new URL(url);
  return httpRequest(parsed.hostname, parsed.pathname + parsed.search, method, headers, params.body);
}

async function getRecentMessages(limit = 20) {
  const res = await supabaseQuery('GET', 'chat_messages', {
    query: { select: 'role,content', order: 'created_at.desc', limit: String(limit) },
  });
  if (res.status === 200 && Array.isArray(res.data)) {
    return res.data.reverse();
  }
  return [];
}

async function saveMessage(role, content) {
  await supabaseQuery('POST', 'chat_messages', {
    body: { role, content },
    prefer: 'return=minimal',
  });
}

async function getMemory() {
  const res = await supabaseQuery('GET', 'chat_memory', {
    query: { select: 'key,value', order: 'updated_at.desc', limit: '50' },
  });
  if (res.status === 200 && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

async function callAI(systemPrompt, messages) {
  // Convert messages to Anthropic format
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const res = await httpRequest('api.anthropic.com', '/v1/messages', 'POST', {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }, {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  });
  if (res.status === 200 && res.data.content) {
    return res.data.content[0].text;
  }
  throw new Error(`AI error (${res.status}): ${JSON.stringify(res.data)}`);
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.length > 4000) {
      return res.status(400).json({ error: 'Invalid message' });
    }

    // Get conversation history + memory
    const [history, memory] = await Promise.all([getRecentMessages(20), getMemory()]);

    // Build messages array
    let systemContent = SYSTEM_PROMPT;
    if (memory.length > 0) {
      systemContent += '\n\nPERSISTENT MEMORY (key facts the user has established):\n';
      for (const m of memory) {
        systemContent += `- ${m.key}: ${m.value}\n`;
      }
    }

    const messages = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    // Save user message
    await saveMessage('user', message);

    // Call Anthropic Claude
    const reply = await callAI(systemContent, messages);

    // Save assistant reply
    await saveMessage('assistant', reply);

    // Check if the assistant wants to save memory (simple pattern detection)
    const memoryMatch = reply.match(/\[REMEMBER: (.+?)=(.+?)\]/g);
    if (memoryMatch) {
      for (const m of memoryMatch) {
        const [, key, value] = m.match(/\[REMEMBER: (.+?)=(.+?)\]/);
        await supabaseQuery('POST', 'chat_memory', {
          body: { key: key.trim(), value: value.trim() },
          prefer: 'return=minimal,resolution=merge-duplicates',
        });
      }
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
