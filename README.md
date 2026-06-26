# AI Council

A private, invite-only AI council app. It uses Supabase for authentication and data, OpenRouter's OpenAI-compatible API for LLM calls, and Firecrawl's standalone API for optional web research.

## Features

- Invite-only Supabase auth with admin invites.
- Saved and ephemeral council chats.
- Up to 8 model council members with a separate judge model.
- Optional web research through Firecrawl's standalone search API, with at least 15 detailed sources gathered before council answers.
- File attachments in chat: upload up to 5 private files per run, with text extraction for text-like formats such as Markdown, CSV, JSON, SQL, logs, and source files.
- Usage and cost tracking with admin budget controls.
- Evals for comparing council configurations.

## Local Setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local` and fill in the keys.
3. Create a Supabase project and run the SQL migrations in `supabase/migrations` in filename order.
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
- File uploads use the private Supabase Storage bucket created by `supabase/migrations/0003_file_attachments.sql`.
- Optional web research uses `FIRECRAWL_API_KEY` to call Firecrawl's `/v2/search` API directly.
- `INITIAL_ADMIN_EMAIL` gets admin access even before an invite exists.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
