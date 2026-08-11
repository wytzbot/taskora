# Taskora v2 cost controls

- Free AI actions: 3/day
- Premium AI actions: 30/day
- Groq is primary; Gemini is fallback.
- AI requests should receive only compact, relevant task/deadline/exam context.
- Output is capped at 450 tokens (Free) / 600 tokens (Premium).
- Quotas and premium entitlement MUST be enforced server-side.
- Flutterwave entitlement should be verified through the existing LabGuru webhook integration.
- Never expose GROQ_API_KEY or GEMINI_API_KEY in browser JavaScript.
- Cache deterministic/repeatable planning results where appropriate.
