const express = require('express');
const cors = require('cors');
const path = require('path');

const chatHandler = require('./api/chat');
const testHandler = require('./api/test');
const stateHandler = require('./api/state');
const logsHandler = require('./api/logs');
const ledgerHandler = require('./api/ledger');
const attorneysHandler = require('./api/attorneys');
const chatHistoryHandler = require('./api/chat/history');
const assistantTickHandler = require('./api/assistant/tick');
const composioHandler = require('./api/integrations/composio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'mini-meish', time: new Date().toISOString() });
});

// Reuse Vercel-style handlers so one codepath works on Vercel and Railway.
app.all('/api/chat', (req, res) => chatHandler(req, res));
app.all('/api/test', (req, res) => testHandler(req, res));
app.all('/api/state', (req, res) => stateHandler(req, res));
app.all('/api/logs', (req, res) => logsHandler(req, res));
app.all('/api/ledger', (req, res) => ledgerHandler(req, res));
app.all('/api/attorneys', (req, res) => attorneysHandler(req, res));
app.all('/api/chat/history', (req, res) => chatHistoryHandler(req, res));
app.all('/api/assistant/tick', (req, res) => assistantTickHandler(req, res));
app.all('/api/integrations/composio', (req, res) => composioHandler(req, res));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // Keep startup log minimal for hosted environments.
  console.log(`mini-meish listening on :${PORT}`);
});
