# Security Policy

StoryCam handles private story ideas, optional photos, generated media, provider credentials, and account-scoped storage. Please report security issues privately.

## Reporting

Email security reports to the project owner or maintainer listed on the repository profile. If a private channel is not available, open a minimal public issue that says you have a security report and avoid including exploit details or sensitive data.

Include:

- affected version or commit,
- impacted surface,
- reproduction steps without real secrets or private user data,
- expected impact,
- any safe logs with secrets and private content removed.

## Please Do Not Include

- raw private story input,
- user photos or generated private media,
- full prompts or prompt packets,
- provider request or response bodies,
- signed URLs,
- Supabase service-role keys,
- provider API keys,
- cookies, auth headers, or JWTs,
- unredacted production logs.

## Project Security Boundaries

- Provider calls stay server-side.
- Supabase service-role keys stay server-side.
- Storage buckets are private by default.
- Signed media URLs may be rendered by the browser, but must not be persisted in browser storage.
- Public sharing links are not part of Phase 1.
- Real generation is protected by auth, origin checks, quotas, and premiere-ticket budgets.

See `docs/SECURITY.md`, `docs/generated/privacy-logging.md`, and `docs/references/providers.md` for the engineering policy.
