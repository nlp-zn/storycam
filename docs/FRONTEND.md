# Frontend

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Local shadcn-style primitives in `src/components/ui`
- StoryCam composition wrappers in `src/components/storycam/StoryCamPrimitives.tsx`
- lucide icons
- `motion` for local transitions and generated-state movement
- Supabase Auth client for Google login

## UI Rules

- First screen should be the usable StoryCam creation surface.
- No mobile-only first version.
- Keep controls compact and task-oriented.
- Prefer local shadcn-style primitives from `src/components/ui` for reusable controls, then apply StoryCam variants/wrappers instead of ad hoc repeated styling.
- Keep StoryCam-specific composition wrappers in `src/components/storycam/StoryCamPrimitives.tsx` when a pattern repeats across flow surfaces, such as bottom docks, cinematic panels, status badges, modal frames, and skeleton lines.
- Use lucide icons for UI actions. Icons inside shadcn-style buttons should use the local button/icon conventions so sizing and spacing stay consistent.
- Loading, error, empty, retry, cancel, stale, and success states must be visible.
- Do not show sharing UI in Phase 1.
- Do not show raw provider payloads, prompt packets, model parameters, or Shanyin-style internals. User-facing output specs such as `720p` are allowed when shown as plain product status.

## Expected Main Surfaces

- Idea input + five creation modes + lightweight director choices + photo upload. `手绘旅行 VLOG` additionally shows a compact travel-destination input, defaults to `9:16`, and disables submit until one photo and one destination are present.
- Recent projects entry above the creation-entry list; homepage stays on input and lets users choose a project instead of auto-jumping. The inline entry previews only a couple of projects, while the drawer can list up to 20 recent restorable projects in an internal scroll area, supports two-step deletion, and always continues a selected project at the story-world review step.
- Discovery samples under `发现更多` use the fixed sample manifest in `src/features/storycam/domain/shellContent.ts`. Sample media lives in the private Supabase `storycam-generated` bucket under `samples/discovery/`, and the client plays short-lived signed URLs from `/api/storycam-discovery-samples`; do not hard-code raw bucket paths or public video files in the UI.
- Story world confirmation, including local generating and failed states after the input CTA immediately navigates to `/storycam/story-world`.
- Core storyboard confirmation, including local generating and failed states after story-world confirmation immediately navigates to `/storycam/core-storyboard`; when the 9-frame script returns before the first representative image job, show the script immediately and keep only the image area in a waiting state.
- Inline 9-frame core storyboard workbench: frame 01 stays in the center on first entry; frames 02-09 are introduced only after the user clicks the center image, then generate around it without navigating away from `/storycam/core-storyboard`.
- Clip generation workbench on `/storycam/clip-generation`, including local task-creation loading/failure after the core storyboard CTA immediately navigates there, async job status, 720p output spec, preview, retry/retake, final work creation, account-scoped preview, and one-click MP4 export without opening a raw browser video page.

## Visual Reference Policy

Use the current update images listed in `docs/design-docs/index.md` as visual source of truth. Do not reintroduce old Stitch HTML exports or old screenshots as implementation references.
