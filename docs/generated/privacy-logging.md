# Privacy Logging Contract

Status: implemented snapshot, sourced from `src/lib/privacy/redact.ts`, `src/server/logging/storycamLogger.ts`, and provider request repositories.
Sentry uses the same redaction boundary through `src/server/monitoring/sentryRedaction.ts`
and worker-safe capture helpers.

## Allowed Log Fields

Logs may include:

- `requestId`
- `jobId`
- `sessionIdHash`
- `userIdHash`
- `idempotencyKeyHash`
- `generationMode`
- `providerKind`
- `providerName`
- `providerRequestId`, only when it is not a secret-bearing token
- `artifactVersions`
- `status`
- `attempt`
- `errorCode`
- `retryable`
- `redactionApplied`
- `lockedBy`, only for worker ids
- `premiereTicketId`, only as an opaque id for server-side budget diagnostics

## Forbidden Log Fields

Logs must not include:

- raw private user input,
- full scripts,
- full prompts,
- full clip prompt packets,
- uploaded photo signed URLs,
- generated media signed URLs,
- Supabase service role key,
- OpenRouter API key,
- Seedance API key,
- provider raw request body,
- provider raw response body,
- storage paths,
- unredacted provider errors.
- admin ticket notes that contain raw private story text.

## Error Redaction

All user-facing and loggable errors should normalize to:

```ts
type RedactedError = {
  code: string;
  message: string;
  retryable: boolean;
  redactionApplied: true;
};
```

## Provider Request Summaries

`provider_requests.request_summary_json` may include:

- provider kind/name,
- model name,
- artifact ids and versions,
- duration target,
- media count,
- high-level operation name.

It must not include:

- full prompt text,
- private user story,
- signed URLs,
- raw provider payload.

## Storage URL Handling

- Store bucket/key in `media_assets`.
- Generate short-lived signed URLs only when needed.
- Do not log signed URLs.
- Do not persist signed URLs in browser storage; client-side caches that include signed media URLs must stay in memory.
- Do not store long-lived public URLs in metadata.
- Provider reference URLs have a separate TTL and must not be returned to the client as UI preview URLs.
