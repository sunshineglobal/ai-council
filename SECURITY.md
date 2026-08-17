# Security

## Supported version

The current default branch is supported. Upgrade older deployments before requesting security fixes.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, exploit details, or a working proof of concept.

Report privately through [GitHub Security Advisories](https://github.com/sunshineglobal/ai-council/security/advisories/new). Include the affected release or commit, impact, reproduction steps, and any request IDs. Rotate any credential that may have been disclosed before sending the report.

We will acknowledge the report, confirm the issue, and coordinate a fix before any public disclosure.

## Security model

- Supabase authentication establishes identity; application routes enforce invite and role checks.
- The browser receives only the Supabase publishable key. Application data and private file mutations are server-only and use the service role.
- Row-level security remains enabled as defense in depth, while database grants prevent public and authenticated roles from bypassing server validation.
- Provider and service credentials are server-only. Production startup validation checks required configuration and rejects an accidentally reused public/service-role key.
- Paid AI work is constrained by a model allowlist, hard budget reservations, distributed rate limits, and per-user concurrency leases.
- Mutating routes enforce same-origin requests. Responses include a restrictive CSP and standard browser security headers.
- Attachments are private, text-only, size/count/quota limited, and normalized to a non-executable content type.
- Logs use structured events and request IDs. API responses do not return internal exception details.

These controls do not make arbitrary sensitive data safe to submit to third-party model or research providers. Deployment owners remain responsible for provider settings, contracts, user notices, access reviews, backups, retention, incident response, and legal or regulatory requirements.
