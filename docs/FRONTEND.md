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
- Do not show raw provider payloads, prompt packets, or Shanyin-style internals. User-facing output specs such as `720p` are allowed when shown as plain product status.

## Expected Main Surfaces

- Idea input + lightweight director choices + photo upload.
- Recent projects entry above the creation-entry list; homepage stays on input and lets users choose a project instead of auto-jumping.
- Story world confirmation, including local generating and failed states after the input CTA immediately navigates to `/storycam/story-world`.
- Core storyboard confirmation, including local generating and failed states after story-world confirmation immediately navigates to `/storycam/core-storyboard`; when the 9-frame script returns before the first representative image job, show the script immediately and keep only the image area in a waiting state.
- Inline 9-frame core storyboard workbench: frame 01 stays in the center on first entry; frames 02-09 are introduced only after the user clicks the center image, then generate around it without navigating away from `/storycam/core-storyboard`.
- Clip generation workbench on `/storycam/clip-generation`, including local task-creation loading/failure after the core storyboard CTA immediately navigates there, async job status, 720p output spec, preview, retry/retake, final work creation, account-scoped preview, and MP4 export.
