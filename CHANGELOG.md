# Changelog

All notable StoryCam changes are recorded here.

## [0.1.1.1] - 2026-05-14

### Changed

- Simplified final work composition internals, provider config parsing, worker typing, and deep health status reporting without changing user-facing behavior.

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
