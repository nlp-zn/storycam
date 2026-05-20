# Security

## Auth

- Use Supabase Auth.
- Google login is the preferred first auth path.
- StoryCam sessions, artifacts, jobs, and media must belong to `auth.users.id`.

## Database

- Use Supabase Postgres.
- Enable RLS for StoryCam tables.
- Users can only access their own sessions, artifacts, jobs, and media metadata.
- Server service role keys must stay server-only.

## Storage

- Use private Supabase Storage buckets.
- Do not create public sharing links in Phase 1.
- Preview media with short-lived signed URLs or an authenticated proxy.
- Provider reference media uses server-created signed URLs with a separate TTL; do not send localhost Storage URLs to external providers.
- Delete session media from Storage when deleting a session.

## AI Providers

- DeepSeek, OpenRouter, Inference.sh, and Vercel AI SDK provider keys must be server-only.
- Seedance API keys must be server-only.
- Do not expose full provider requests or raw provider errors to the client.
- Do not expose provider reference signed URLs to the browser as UI preview URLs.

## API Guards

- Unsafe API methods must pass the same-origin guard. Production allows `NEXT_PUBLIC_APP_URL`
  and comma-separated `STORYCAM_ALLOWED_ORIGINS`; local development also allows localhost.
- Real generation mode enforces server-side per-user daily quotas for image, video, and
  final-work job families. Cloudflare rate limits are defense-in-depth, not the only cost
  control.
- Ordinary-user real generation also requires an account-scoped `首映券`. Tickets are
  server-owned, bind to one session, and enforce per-ticket budgets before provider jobs
  are created. Admin manual issuance must write an audit event.
- Deep health checks require `Authorization: Bearer STORYCAM_DEEP_HEALTH_TOKEN` and must
  not reveal secrets or storage paths.

## Privacy

Never log:

- raw private user input,
- full scripts,
- full prompts,
- full clip prompt packets,
- signed URLs,
- provider secrets,
- unredacted provider error bodies.
- admin ticket notes that include raw private story input.

Sentry capture is allowed only with safe context such as job id, provider kind/name, status,
attempt count, redacted error code, and hashed identifiers. Do not send raw input, prompt
text, scripts, signed URLs, storage paths, provider bodies, or secrets to Sentry.
