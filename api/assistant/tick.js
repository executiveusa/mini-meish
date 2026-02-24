const db = require('../../lib/db');

module.exports = async function handler(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const state = await db.getState();
    const tasks = await db.listOpenAssistantTasks(10);
    const bondFacts = state.bondFacts || {};

    const suggestions = [];
    for (const [caseId, data] of Object.entries(bondFacts)) {
      if (!data.noticeMailed && !data.sjDate) {
        suggestions.push(`Case ${caseId}: Notice mailing date is missing. Call clerk to verify.`);
      }
    }

    if (tasks.length === 0) {
      suggestions.push('No open assistant tasks tracked yet. Ask me to create a follow-up task.');
    }

    if (suggestions.length > 0) {
      const summary = suggestions.slice(0, 3).join(' ');
      await db.addChatMessage('assistant', `Proactive check-in: ${summary}`);
    }

    return res.status(200).json({ ok: true, suggestions, openTasks: tasks.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
