module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    env: {
      hasSupa: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasPort: !!process.env.PORT,
    },
    method: req.method,
  });
};
