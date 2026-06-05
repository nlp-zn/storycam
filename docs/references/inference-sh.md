# Inference.sh Reference

Status: active provider reference.

This document captures the Inference.sh rules StoryCam agents should keep in mind when changing image generation. It summarizes the official Inference.sh SDK, CLI, and skills references checked from `https://github.com/inference-sh/skills`.

## StoryCam Usage

StoryCam image generation uses Inference.sh through server-side code only. In production
real mode, API routes create durable StoryCam jobs and the background worker submits and
polls Inference.sh tasks.

```text
STORYCAM_IMAGE_PROVIDER=inference_sh
INFERENCE_API_KEY=
INFERENCE_IMAGE_APP=openai/gpt-image-2
```

The browser must never call Inference.sh directly or receive `INFERENCE_API_KEY`. StoryCam
stores the Inference.sh task id in `generation_jobs.provider_request_id` only after the
worker submits the provider task, then downloads completed image output server-side into
the private `storycam-generated` Supabase bucket.

## SDK Rules

Use the official JavaScript SDK:

```bash
pnpm add @inferencesh/sdk
```

Server-side shape:

```ts
import { inference } from "@inferencesh/sdk";

const client = inference({ apiKey: process.env.INFERENCE_API_KEY, stream: false });
const task = await client.run(
  {
    app: "openai/gpt-image-2",
    input: {
      prompt,
      images: ["https://signed-character-reference", "https://signed-scene-reference"],
      width: 1536,
      height: 864,
      n: 1,
      output_format: "png",
      quality: "high"
    }
  },
  { wait: false, stream: false }
);

const current = await client.getTask(task.id);
```

`client.run` supports:

- `wait: true` for synchronous local smoke checks or single blocking calls.
- `wait: false` for production StoryCam image tasks.
- `stream: true` for streaming progress when an app supports it.

StoryCam should prefer `wait:false` for user-facing routes because character assets, scene assets, core storyboard images, and expanded storyboard images can all be submitted concurrently.

For storyboard images, StoryCam uses Inference.sh's `openai/gpt-image-2` app with multi-image reference input. The official skill documents `images` as reference image URLs and shows multi-image reference with:

```json
{
  "prompt": "combine these two characters into one scene",
  "images": ["https://character1.jpg", "https://character2.jpg"]
}
```

The StoryCam server maps ready character and scene asset signed URLs into that `images` array, while the frame-specific storyboard instruction remains in `prompt`.
At the adapter level, local or private-network reference URLs can be downloaded server-side and sent to the Inference.sh SDK as data URIs. Current StoryCam storyboard-reference routes are stricter: provider reference URLs must be public HTTPS signed URLs from hosted storage. Local Supabase Storage URLs are valid for mock/local UI work, not real reference-image provider calls.

## Task Status And Output

StoryCam treats these statuses as successful:

- official string status: `completed` or `succeeded`
- legacy numeric status: `10`

StoryCam treats these statuses as terminal failures:

- official string status: `failed`, `canceled`, or `cancelled`
- errored task status with an `error` payload, including observed numeric status `11`
- legacy numeric status: `20`

Image apps usually return completed output under `output.images`. StoryCam reads only the first image URI, downloads it server-side, validates the MIME type, and writes the bytes to private storage. Do not expose provider image URIs to clients or logs.

## CLI Parity

The Inference.sh CLI uses `belt`.

Useful discovery and smoke commands:

```bash
belt app list
belt app get openai/gpt-image-2
belt app sample openai/gpt-image-2
```

Async task parity:

```bash
belt app run openai/gpt-image-2 --input input.json --no-wait
belt task get <task-id>
```

Use CLI discovery to inspect app input/output requirements before changing provider payloads.

## Error Handling

The SDK exposes official error classes such as:

- `RequirementsNotMetException`
- `InferenceError`

StoryCam maps these to redacted provider failures. Provider diagnostics can mention high-level causes such as missing app requirements or upstream inference failure, but must not include:

- prompts
- user private story input
- API keys
- provider image URIs
- signed Supabase URLs
- raw unredacted provider payloads

## Current StoryCam Pipeline

Image submission:

1. API builds a provider input from a confirmed artifact.
2. API creates a `generation_jobs` row without a provider task id.
3. API returns `{ status: "generating", jobId }`.
4. Worker claims the job and calls `client.run(..., { wait:false })`.
5. Worker stores the Inference.sh task id in `generation_jobs.provider_request_id`.

Image resolution:

1. Worker reclaims runnable jobs after `run_after`.
2. Worker calls `client.getTask(taskId)`.
3. If still running, worker releases the job with a future `run_after`.
4. If completed, worker downloads `output.images[0]`, stores it privately, marks the job
   succeeded, and the read-only job endpoint can return a fresh signed URL.
5. If failed, worker marks the job failed and the read-only job endpoint returns redacted
   placeholder state.

This keeps multi-image flows concurrent: 1-3 character sheets plus one scene board, 1-3 core storyboard main images, and 8 expanded storyboard images can progress independently.
