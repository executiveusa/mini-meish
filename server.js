const express = require('express');
const cors = require('cors');
const path = require('path');

const chatHandler = require('./api/chat');
const testHandler = require('./api/test');

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

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // Keep startup log minimal for hosted environments.
  console.log(`mini-meish listening on :${PORT}`);
});
