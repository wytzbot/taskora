# Taskora

Taskora is a lightweight student workload-autopilot PWA.

## Included
- `index.html` — UI
- `data.js` — local-first app logic/state
- `api/ai.js` — secure Groq → Gemini fallback API route
- `sw.js` — offline shell
- FCM-ready architecture
- Premium/paywall UI
- Local usage limits
- Native-feeling bottom sheets and navigation
- Deadline Rescue and contextual AI question cards

## Run
1. Deploy the project to Vercel.
2. Add environment variables from `.env.example`.
3. Deploy.
4. Configure your verified payment entitlement lookup inside `api/ai.js`.
5. Add your real Flutterwave payment links in the Premium flow.
6. Add FCM configuration/credentials when you wire notifications.

## Important production wiring
This starter intentionally does NOT pretend that a frontend flag proves payment. The `isPremium()` function in `api/ai.js` is a clearly marked integration point for the existing Future payment verification endpoint/verified entitlement service.

Also replace the in-memory AI rate limiter with a persistent server-side limiter before scaling beyond a small launch. The frontend limit is only UX; the server must be authoritative.

## Payment link setup
For a quick test, the UI reads:
- `localStorage.taskora_payment_usd`
- `localStorage.taskora_payment_ngn`

Do not ship real payment secrets to the frontend. Payment URLs themselves may be public, but entitlement verification must happen server-side.

## FCM
FCM is intentionally not fake-wired. Add your Firebase web app config and service-worker messaging implementation when you have the project credentials. The app already has notification settings and a service-worker foundation.

## QA checklist
Test:
- first-run onboarding
- add/edit/delete/complete tasks
- courses and exams
- focus timer
- AI success and failure
- AI daily limit
- offline planner
- install prompt
- theme
- notification settings
- payment flow
- verified Premium entitlement
- webhook idempotency
- API keys never exposed to client
