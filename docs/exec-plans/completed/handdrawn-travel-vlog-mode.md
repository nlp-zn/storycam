# Handdrawn Travel VLOG Mode

Status: completed
Date: 2026-05-12

## Goal

Add a fifth input mode, `handdrawn-travel-vlog`, that requires one user photo and a user-specified travel destination, then routes through the existing StoryCam confirmation and generation workflow.

## Completed Scope

- Added input-shell content, validation, and request fields for `storyModeId` and `travelDestination`.
- Kept the feature inside existing story-world, asset-image, storyboard, clip, and final-work artifacts without adding database columns.
- Made provider prompts treat the mode as a light story VLOG: a hand-drawn illustrated traveler character placed into real travel-location backgrounds.
- Preserved privacy/provider boundaries: no client provider calls, no raw payloads, no signed URLs or private inputs in logs.

## Verification

- Domain/unit/API tests cover mode ordering, required photo/destination validation, script mode persistence, and prompt shaping.
- Playwright input E2E covers selecting the new mode, uploading a photo, entering a destination, and submitting `storyModeId`, `travelDestination`, `uploadedPhotoIds`, and `9:16`.
