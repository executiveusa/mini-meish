# Assistant Expansion Plan

## Goal
Build an expandable assistant inspired by Leon and Ironclaw patterns while staying integrated inside the Meish dashboard.

## Implemented Foundations
- Persistent memory in database (`chat_messages`, `chat_memory`)
- Action execution from natural language corrections
- Autonomous check-in endpoint (`/api/assistant/tick`)
- Voice input/output in dashboard chat
- API-first architecture that runs on Vercel or Railway Docker

## Composio MCP Integration Path
1. Set `COMPOSIO_API_KEY` in Railway/Vercel.
2. Use `/api/integrations/composio` as integration control endpoint.
3. Add OAuth UI flow in dashboard settings for Gmail/Outlook.
4. Persist tokens and tool metadata in Postgres tables.
5. Add assistant tools for:
   - fetch inbox summaries
   - send draft responses
   - create follow-up reminders from emails

## Ironclaw-inspired Enhancements
- Tool registry with allowlist/permissions per action
- Memory tiers: short-term chat + long-term case facts
- Autonomous planner loop with human approval gates
- Voice-first interaction plus optional proactive notifications
- Trace/eval logs for every assistant action

## Safety and Control
- Assistant can suggest and draft, but sensitive actions should require explicit user confirmation.
- Legal decisions should always include a reminder to confirm with licensed counsel.
