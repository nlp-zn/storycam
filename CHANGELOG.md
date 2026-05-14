# Changelog

All notable StoryCam changes are recorded here.

## [0.1.3.0] - 2026-05-15

### Added

- The discovery wall now plays eight curated inspiration samples from private StoryCam storage, with signed preview URLs and two reserved placeholder slots for upcoming samples.
- Added a discovery sample upload script that creates posters and uploads the canonical MP4/JPG assets to the private Supabase bucket.

### Changed

- Core storyboard frame badges now show only frame numbers, and the vertical 9:16 storyboard layout keeps the script and audio hint closer together.
- Seedance smoke testing can target Seedance 2.0 Fast directly through the provider-specific smoke path.

### Fixed

- Seedance 2.0 Fast requests now stay within the provider's supported duration and resolution limits.
- Unopened Seedance models now report a non-retryable configuration failure instead of looking like transient provider errors.
- Discovery sample preview URLs refresh before expiry, and poster reloads retry without exposing raw storage paths.

## [0.1.2.0] - 2026-05-14

### Changed

- Story-world and core storyboard generation can now continue through durable worker jobs in real mode, so long-running provider calls no longer depend on the browser tab or a Cloudflare request window staying open.
- Real image and video provider task submission now starts from the worker path, keeping browser requests focused on queuing work and reading saved job state.
- The StoryCam client now waits for durable story-world and storyboard jobs through the existing generation-job restore flow.

### Fixed

- Real storyboard requests keep the server-side image quota check before queuing worker-owned work.
- Generation job updates now avoid reusing canceled/failed idempotency records and avoid writing provider task ids or terminal status onto jobs that are no longer active.
- Restore E2E coverage now scopes the storyboard title assertion to the restored frame card instead of the matching script summary panel.

## [0.1.1.2] - 2026-05-14

### Fixed

- Fixed the Render background worker startup path by shimming Next's `server-only`
  marker before loading worker modules under raw `tsx`.

## [0.1.1.1] - 2026-05-14

### Changed

- Simplified final work composition internals, provider config parsing, worker typing, and deep health status reporting without changing user-facing behavior.
- GitHub CI now installs ffmpeg so real-mode final MP4 readiness checks run in the same class of runtime the deployment expects.

## [0.1.1.0] - 2026-05-14

### Added

- Recent projects now support a larger restorable history, drawer scrolling, two-step deletion, and safer recovery when older project records are malformed.
- Final works can now be exported through an authenticated MP4 download that keeps users on the StoryCam preview page instead of opening a raw video URL.
- Handdrawn travel and storyboard generation now preserve vertical 9:16 context, real travel backgrounds, fixed scene anchors, and clearer shot rhythm across the 9-frame group.
- StoryCam now includes favicon/app icons and a deployment planning baseline for the Render + Supabase + Cloudflare launch path.

### Changed

- Core storyboard and clip-generation UI states now keep pending, canceled, failed, retry, export, and final-work states visible inside the guided flow.
- Provider prompts now keep ordinary user-facing storyboard text in Simplified Chinese while reserving English for internal image prompts.
- StoryCam docs now describe direct MP4 export, recent-project deletion, provider continuity anchors, and the progressive test-selection strategy.

### Fixed

- Late clip polling can no longer overwrite a terminal canceled clip state back to queued.
- Seedance Fast submission failures stay associated with the selected Fast provider instead of silently downgrading to the regular model.
- MP4 download failures, invalid media ids, and unauthorized export requests return redacted, account-scoped responses.
