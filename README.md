# AI Council

A private, invite-only AI council app. It uses Supabase for authentication and data, OpenRouter's OpenAI-compatible API for LLM calls, and Firecrawl's standalone API for optional web research.

## Features

- Invite-only Supabase auth with admin invites.
- Saved and ephemeral council chats.
- Up to 8 model council members with a separate judge model.
- Optional web research through Firecrawl's standalone search API, with at least 15 detailed sources gathered before council answers.
- File attachments in chat: upload up to 5 private files per run, with text extraction for text-like formats such as Markdown, CSV, JSON, SQL, logs, and source files.
- Usage and cost tracking with admin budget controls.
- Evals for comparing labeled council configurations with rubric scores and per-prompt detail.

## Project structure

- `app/` contains Next.js App Router pages and HTTP route handlers.
- `components/` contains the client-facing council, admin, eval, and authentication interfaces.
- `lib/` contains council orchestration, provider clients, validation, persistence helpers, and shared utilities.
- `supabase/migrations/` contains the database schema, row-level security policies, and private attachment bucket setup.
- `tests/` contains Vitest unit tests and Playwright browser smoke tests.

## Local setup

1. Install Node.js 20.9 or newer. Node.js 22 is the repository default in `.node-version`.
2. Copy `.env.example` to `.env.local` and fill in the required keys.
3. Create a Supabase project and run every SQL migration in `supabase/migrations` in filename order.
4. Install dependencies and run the app:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

If the app opens to `/setup`, one or more required keys are still missing.
After editing `.env.local`, restart `npm run dev`.

## Configuration

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Required in production | Canonical public origin. Production requires HTTPS. |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Supabase project URL used by browser and server clients. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required | Publishable Supabase key used for user sessions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server-only key used for privileged database operations. Never expose it to the browser. |
| `OPENROUTER_API_KEY` | Required | Server-only key used for model discovery and council completions. |
| `FIRECRAWL_API_KEY` | Optional | Enables web research through Firecrawl's `/v2/search` API. |
| `INITIAL_ADMIN_EMAIL` | One-time setup | Bootstraps the first administrator only while no profiles exist. The first login persists a normal admin invite. |
| `ALLOWED_MODEL_IDS` | Required in production | Comma-separated OpenRouter model allowlist enforced by the server. |
| `DEFAULT_MONTHLY_BUDGET_USD` | Required in production | Hard per-user monthly default when a profile has no custom budget. |
| `MAX_USER_ATTACHMENT_STORAGE_MB` | Optional | Per-user active attachment quota; defaults to 100 MB. |
| `EPHEMERAL_ATTACHMENT_TTL_HOURS` | Optional | Retention for unsaved attachments; defaults to 24 hours. |
| `CRON_SECRET` | Required in production | At least 32 characters; authenticates scheduled maintenance. |
| `ERROR_WEBHOOK_URL` | Optional | HTTPS destination for structured application error events. |
| `REQUIRE_PRODUCTION_ENV` | Self-hosted production | Set to `true` to fail startup when production configuration is invalid. Vercel production is detected automatically. |

File uploads use the private Supabase Storage bucket created by `supabase/migrations/0003_file_attachments.sql`.

## Verification

Run the local quality gate:

```bash
npm run check
```

That command runs ESLint, TypeScript, and the Vitest unit suite. Run the complete release gate and browser checks before deployment:

```bash
npm run check:release
npm run test:e2e
```

Playwright starts the development server automatically and exercises both desktop Chromium and a mobile viewport. The smoke test uses `/setup`, so it does not require live Supabase or provider credentials. Install the Chromium browser once if Playwright requests it:

```bash
npx playwright install chromium
```

`check:release` adds the production build and production dependency audit. GitHub Actions additionally runs the credential-free Playwright suite on desktop and mobile for every push and pull request.

Useful individual commands:

```bash
npm run lint
npm run typecheck
npm test
npm run test:watch
npm run test:e2e
```

## Production deployment

Read [docs/PRODUCTION.md](docs/PRODUCTION.md) before the first deployment. It covers database rollout, secrets, health checks, alerting, smoke tests, rollback, backup/restore, retention, and provider-data considerations.

Security controls and disclosure guidance are documented in [SECURITY.md](SECURITY.md).
