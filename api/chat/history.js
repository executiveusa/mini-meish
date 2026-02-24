const db = require('../../lib/db');

module.exports = async function handler(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const messages = await db.listChatMessages(60);
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
