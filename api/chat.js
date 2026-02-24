const https = require('https');
const db = require('../lib/db');

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();

const SYSTEM_PROMPT = `You are Meish's Defense Assistant, proactive and practical.
You can track progress, suggest next actions, and help correct dashboard records.
Always be concise, accurate, and calm. You are not a lawyer.
When legal strategy is asked, recommend consulting qualified counsel.

Available action intents you may return:
- set_profile_field
- correct_bond_fact
- correct_contact
- add_log_entry
- create_assistant_task
- none

For legal context:
- Verify forfeiture date, notice mailing date, summary judgment date by county.
- Do not advise admitting liability before court verification.
- Encourage documenting every communication in Logbook.
`;

function httpRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname,
      path,
      method,
      headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, data: buf });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function callAnthropic(system, messages, maxTokens = 800) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }
  const res = await httpRequest(
    'api.anthropic.com',
    '/v1/messages',
    'POST',
    {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages,
    }
  );

  if (res.status === 200 && Array.isArray(res.data.content) && res.data.content[0]) {
    return res.data.content[0].text;
  }
  throw new Error(`Anthropic error (${res.status}): ${JSON.stringify(res.data)}`);
}

async function detectAction(userMessage) {
  const detectorSystem = `Return strict JSON only.
Schema:
{
  "intent": "set_profile_field|correct_bond_fact|correct_contact|add_log_entry|create_assistant_task|none",
  "payload": { }
}
If uncertain, use intent="none" and payload={}.`;

  const text = await callAnthropic(detectorSystem, [{ role: 'user', content: userMessage }], 250);
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.intent) return { intent: 'none', payload: {} };
    return parsed;
  } catch {
    return { intent: 'none', payload: {} };
  }
}

async function applyAction(action) {
  const state = await db.getState();

  switch (action.intent) {
    case 'set_profile_field': {
      const field = action.payload?.field;
      const value = action.payload?.value;
      if (!field || value === undefined) return { applied: false, note: 'Missing field/value' };
      await db.upsertProfileField(field, String(value));
      return { applied: true, note: `Updated profile field ${field}.` };
    }

    case 'correct_bond_fact': {
      const caseId = action.payload?.caseId;
      const field = action.payload?.field;
      const value = action.payload?.value;
      if (!caseId || !field) return { applied: false, note: 'Missing caseId/field.' };
      const bondFacts = state.bondFacts || {};
      bondFacts[caseId] = { ...(bondFacts[caseId] || {}), [field]: value };
      await db.patchState({ bondFacts });
      return { applied: true, note: `Corrected bond fact for ${caseId}: ${field}.` };
    }

    case 'correct_contact': {
      const contactId = action.payload?.contactId;
      const field = action.payload?.field;
      const value = action.payload?.value;
      const contacts = Array.isArray(state.contacts) ? state.contacts : [];
      if (!contactId || !field) return { applied: false, note: 'Missing contactId/field.' };
      const next = contacts.map((c) => (c.id === contactId ? { ...c, [field]: value } : c));
      await db.patchState({ contacts: next });
      return { applied: true, note: `Updated contact ${contactId} field ${field}.` };
    }

    case 'add_log_entry': {
      await db.addLog({
        contact: action.payload?.contact || 'Assistant',
        channel: action.payload?.channel || 'WEB',
        summary: action.payload?.summary || 'Assistant update',
        outcome: action.payload?.outcome || '',
      });
      return { applied: true, note: 'Added log entry.' };
    }

    case 'create_assistant_task': {
      const title = action.payload?.title;
      if (!title) return { applied: false, note: 'Missing task title.' };
      await db.createAssistantTask({
        title,
        details: action.payload?.details || '',
        due_at: action.payload?.due_at || null,
      });
      return { applied: true, note: `Created task: ${title}` };
    }

    default:
      return { applied: false, note: 'No data update required.' };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const message = (req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const [history, memory] = await Promise.all([db.listChatMessages(25), db.listMemory(50)]);

    const action = await detectAction(message);
    const actionResult = await applyAction(action);

    await db.addChatMessage('user', message);

    let memoryLines = '';
    for (const m of memory) memoryLines += `- ${m.key}: ${m.value}\n`;

    const assistantText = await callAnthropic(SYSTEM_PROMPT, [
      {
        role: 'user',
        content:
          `User message: ${message}\n\n` +
          `Recent conversation:\n${history.map((h) => `${h.role}: ${h.content}`).join('\n')}\n\n` +
          `Persistent memory:\n${memoryLines || 'none'}\n\n` +
          `Action detection: ${JSON.stringify(action)}\n` +
          `Action result: ${JSON.stringify(actionResult)}\n\n` +
          `Respond as helpful assistant. If you corrected data, explicitly confirm what changed.`
      },
    ]);

    await db.addChatMessage('assistant', assistantText);

    const memoryMatch = assistantText.match(/\[REMEMBER: (.+?)=(.+?)\]/g);
    if (memoryMatch) {
      for (const m of memoryMatch) {
        const parts = m.match(/\[REMEMBER: (.+?)=(.+?)\]/);
        if (parts && parts[1] && parts[2]) {
          await db.upsertMemory(parts[1].trim(), parts[2].trim());
        }
      }
    }

    return res.status(200).json({ reply: assistantText, action: actionResult });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
};
