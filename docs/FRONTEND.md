# Frontend

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth client for Google login

## UI Rules

- First screen should be the usable StoryCam creation surface.
- No mobile-only first version.
- Keep controls compact and task-oriented.
- Loading, error, empty, retry, cancel, stale, and success states must be visible.
- Do not show sharing UI in Phase 1.
- Do not show raw provider payloads, prompt packets, or Shanyin-style internals.

## Expected Main Surfaces

- Idea input + lightweight director choices + photo upload.
- Recent projects entry above the creation-entry list; homepage stays on input and lets users choose a project instead of auto-jumping.
- Story world confirmation.
- One 15-second core storyboard group with a generated first-frame main storyboard image.
- 9-frame expansion canvas as a modal overlay from the selected main storyboard image; first open shows only frame 01, then clicking the center image generates frames 02-09 without navigating away from `/storycam/core-storyboard`.
- Provider-send confirmation.
- Clip generation status.
- Clip review and retry.
- Final work composition and account-scoped preview.
