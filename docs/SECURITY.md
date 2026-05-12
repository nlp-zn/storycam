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

## Privacy

Never log:

- raw private user input,
- full scripts,
- full prompts,
- full clip prompt packets,
- signed URLs,
- provider secrets,
- unredacted provider error bodies.
