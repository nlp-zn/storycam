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
- Delete session media from Storage when deleting a session.

## AI Providers

- Vercel AI SDK and OpenRouter keys must be server-only.
- Seedance API keys must be server-only.
- Do not expose full provider requests or raw provider errors to the client.

## Privacy

Never log:

- raw private user input,
- full scripts,
- full prompts,
- full clip prompt packets,
- signed URLs,
- provider secrets,
- unredacted provider error bodies.
