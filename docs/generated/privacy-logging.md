# Privacy Logging Contract

Status: implemented baseline, sourced from `src/lib/privacy/redact.ts` and `src/server/logging/storycamLogger.ts`.

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
- unredacted provider errors.

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
- Do not store long-lived public URLs in metadata.
