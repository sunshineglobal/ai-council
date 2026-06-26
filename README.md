# AI Council

A private, invite-only AI council app. It uses Supabase for authentication and data, OpenRouter's OpenAI-compatible API for LLM calls, and Firecrawl for optional web research.

## Local Setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local` and fill in the keys.
3. Create a Supabase project and run `supabase/migrations/0001_ai_council.sql`.
4. Install dependencies and run the app:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

If the app opens to `/setup`, one or more required keys are still missing.
After editing `.env.local`, restart `npm run dev`.

## Required Services

- `OPENROUTER_API_KEY` is used only on the server.
- `FIRECRAWL_API_KEY` is used only on the server.
- `INITIAL_ADMIN_EMAIL` gets admin access even before an invite exists.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
