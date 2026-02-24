module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const hasComposio = Boolean(process.env.COMPOSIO_API_KEY);

  if (req.method === 'GET') {
    return res.status(200).json({
      connected: false,
      configured: hasComposio,
      provider: 'composio',
      note: hasComposio
        ? 'Composio key is configured. OAuth linking for Gmail/Outlook can be completed from dashboard settings.'
        : 'Set COMPOSIO_API_KEY to enable MCP-based app linking.',
    });
  }

  if (req.method === 'POST') {
    // Placeholder for webhook/event ingestion from Composio-connected tools.
    return res.status(202).json({ ok: true, received: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
