const db = require('../lib/db');

module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    env: {
      hasDatabaseUrl: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
      pgConfigured: !!db.hasPg,
      hasSupa: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasPort: !!process.env.PORT,
    },
    method: req.method,
  });
};
