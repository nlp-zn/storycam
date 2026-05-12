# Reliability

## Job Rules

Image generation, video generation, and final work composition are async jobs.

Jobs must support:

- idempotency,
- polling,
- timeout,
- cancel/tombstone,
- late-result discard,
- redacted provider errors.

## Provider Failures

Expected failures:

- malformed model output,
- provider timeout,
- quota exceeded,
- policy refusal,
- Seedance quality mismatch,
- Inference.sh image task failure,
- storage upload failure,
- final work composer failure.

First rescue path for unstable Seedance output: `重拍这个片段`.

## Observability

Logs may include:

- job id,
- hashed session/idempotency identifiers,
- provider kind/name,
- status,
- attempts,
- redacted error code,
- artifact version numbers.

Logs must not include raw private input, full prompts, full prompt packets, provider secrets, signed media URLs, or unredacted provider errors.
