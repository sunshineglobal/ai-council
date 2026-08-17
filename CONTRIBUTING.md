# Contributing

Thanks for helping with AI Council. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## What belongs in this repository

This is a public MIT-licensed repository for an invite-only self-hosted app. Keep changes scoped, tested, and free of secrets.

Do not commit:

- `.env`, `.env.local`, or any file with live keys
- service-role, OpenRouter, Firecrawl, cron, or webhook credentials
- personal data, customer prompts, or production logs
- exploit payloads or attack scripts

## Local development

1. Install Node.js 20.9 or newer. Node.js 22 is the repository default in `.node-version`.
2. Copy `.env.example` to `.env.local` and fill in keys for a local Supabase project. Leave keys empty if you only need the `/setup` screen and unit tests.
3. Install and run:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Quality gate

Every pull request should pass:

```bash
npm run check
```

That runs ESLint, TypeScript, and the Vitest unit suite. For a release-shaped change, also run:

```bash
npm run check:release
npm run test:e2e
```

Playwright's smoke test uses `/setup` and does not need live provider credentials. Install Chromium once if asked:

```bash
npx playwright install chromium
```

## Pull requests

- Keep the diff limited to the problem you are solving.
- Match the surrounding TypeScript, React, and test style.
- Add or update unit tests when you change behavior.
- Update `README.md`, `docs/PRODUCTION.md`, or `SECURITY.md` when the change affects operators.
- Do not reformat unrelated files.

Open a draft pull request if you want early review. Maintainers may ask for tests before merging.

## Security issues

Do not file a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
